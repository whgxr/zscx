/**
 * M2-T5 流程设计器专用 API
 *
 *   GET    /api/approval/workflows/[id]/designer       返回 canvasData (ReactFlow 原生 nodes+edges) + jsonDefinition（引擎 DAG）
 *   PUT    /api/approval/workflows/[id]/designer       保存画布草稿（DRAFT）
 *   POST   /api/approval/workflows/[id]/designer       发布：保存 → 同步 ApprovalNode 行 → status=ACTIVE|PUBLISHED，version++
 *
 *  引擎 jsonDefinition 字段格式（见 engine/types.ts WorkflowDefinition）：
 *    nodes[].id / type / prev[] / next[] / nextTrue[] / nextFalse[] / expression / approvalMode / approverKind / approverCandidates / countersignQuorum / parallelWaitMode / ccTargets
 */
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import type { WorkflowDefinition, WorkflowNodeDef, NodeType as EngineNodeType } from '@/lib/engine'
import { NODE_TYPES } from '@/lib/engine'

/** @deprecated 使用新类型名 */
type JsonDefinition = WorkflowDefinition
type JsonDefinitionNode = WorkflowNodeDef

const KNOWN_NODE_TYPES: EngineNodeType[] = [
  'START','END','APPROVER_SINGLE','APPROVER_COUNTERSIGN','APPROVER_ORSIGN',
  'CONDITION_BRANCH','PARALLEL','CC'
]

// ======== 画布 (CanvasData) ↔ 引擎 (jsonDefinition) 双向转换 ========

type CanvasNode = {
  id: string
  type: 'approval'
  position: { x: number; y: number }
  data: {
    label: string
    nodeType: EngineNodeType
    approver?: {
      approverKind?: string[]
      approverIds?: number[]
      approverRoleIds?: number[]
      fieldPicker?: { fieldName: string; expects: string } | null
      minQuorum?: number | null
    } | null
    condition?: {
      expression?: string | null
      simpleField?: string | null
      simpleOp?: string | null
      simpleValue?: string | null
    } | null
    timeout?: any | null
    onRejectAction?: string
    allowAddCountersign?: boolean
    allowTransfer?: boolean
    requireComment?: boolean
    parallelJoin?: 'ALL' | 'ANY'
    ccConfig?: { ccUserIds?: number[]; ccRoleIds?: number[]; ccField?: string | null } | null
  }
}
type CanvasEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; label?: any; style?: any }
type CanvasData = { nodes: CanvasNode[]; edges: CanvasEdge[]; viewport?: any }

const OP_MAP: Record<string, any> = {
  '==': 'eq', '!=': 'ne', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', in: 'in', contains: 'contains',
}

function canvasToEngine(c: CanvasData, extra: any = {}): WorkflowDefinition {
  const edges = c.edges ?? []
  const nodes: WorkflowNodeDef[] = c.nodes.map(n => {
    const incomers = edges.filter(e => e.target === n.id).map(e => e.source)
    const trueOuts = edges.filter(e => e.source === n.id && e.sourceHandle !== 'false').map(e => e.target)
    const falseOuts = edges.filter(e => e.source === n.id && e.sourceHandle === 'false').map(e => e.target)
    const type: string = n.data.nodeType ?? 'APPROVER_SINGLE'
    const engineType = (NODE_TYPES as readonly string[]).includes(type) ? (type as EngineNodeType) : 'APPROVER_SINGLE'
    const node: WorkflowNodeDef = {
      id: n.id, type: engineType, name: n.data.label ?? type,
      prev: Array.from(new Set(incomers)),
    }
    if (engineType === 'CONDITION_BRANCH') {
      node.nextTrue = trueOuts
      node.nextFalse = falseOuts
      const cCfg = n.data.condition
      if (cCfg?.expression) {
        node.condition = { expressions: [{ field: '__expr__', op: 'eq', value: cCfg.expression }] }
      } else if (cCfg?.simpleField) {
        const op = OP_MAP[cCfg.simpleOp ?? '=='] ?? 'eq'
        let v: any = cCfg.simpleValue
        if (v !== undefined && v !== null && !isNaN(Number(v))) v = Number(v)
        node.condition = { expressions: [{ field: cCfg.simpleField, op, value: v }] }
      }
    } else if (engineType === 'CC') {
      node.next = trueOuts.length ? trueOuts : undefined
      const cc = n.data.ccConfig ?? {}
      if (cc.ccRoleIds?.length) node.ccTargets = { kind: 'ROLE', ids: cc.ccRoleIds }
      else if (cc.ccUserIds?.length) node.ccTargets = { kind: 'USER', ids: cc.ccUserIds }
      else if (cc.ccField) node.ccTargets = { kind: 'FIELD', field: cc.ccField }
    } else if (engineType.startsWith('APPROVER_')) {
      node.next = trueOuts.length ? trueOuts : undefined
      const a = n.data.approver ?? {}
      const kinds = a.approverKind ?? []
      let kind: 'ROLE' | 'USER' | 'FIELD' = 'ROLE'
      if (kinds.includes('FIELD')) kind = 'FIELD'
      else if (kinds.includes('USER')) kind = 'USER'
      const candidates: number[] = []
      let field: string | undefined
      if (kind === 'USER' && a.approverIds?.length) candidates.push(...a.approverIds)
      if (kind === 'ROLE' && a.approverRoleIds?.length) candidates.push(...a.approverRoleIds)
      if (kind === 'FIELD' && a.fieldPicker?.fieldName) field = a.fieldPicker.fieldName
      node.approver = { kind, candidates: candidates.length ? candidates : undefined, field, quorum: a.minQuorum ?? undefined }
    } else if (engineType === 'PARALLEL') {
      node.next = trueOuts.length ? trueOuts : undefined
      node.parallelWaitMode = n.data.parallelJoin === 'ANY' ? 'ANY' : 'ALL'
    } else {
      node.next = trueOuts.length ? trueOuts : undefined
    }
    return node
  })
  return { nodes, globals: extra.globals ?? undefined }
}

// ======== 前端自定义 JsonDef (DefNode[]) → CanvasData 兼容层 ========
//  前端 designer page 维护的是 DefNode{key,type,label,position,approver,condition,timeout,onRejectAction,allowAddCountersign,allowTransfer,requireComment,parallelJoin,ccConfig,...} + edges
//  该函数把它规范化为后端要求的 CanvasData（CanvasNode[] + CanvasEdge[]），以便统一走 canvasToEngine
type FrontendDefNode = {
  key: string
  type: EngineNodeType | string
  label?: string
  position?: { x: number; y: number }
  approver?: { approverKind?: string[]; approverIds?: number[]; approverRoleIds?: number[]; fieldPicker?: { fieldName: string; expects: string } | null; minQuorum?: number | null } | null
  condition?: { expression?: string | null; simpleField?: string | null; simpleOp?: string | null; simpleValue?: string | null } | null
  timeout?: any
  onRejectAction?: string
  allowAddCountersign?: boolean
  allowTransfer?: boolean
  requireComment?: boolean
  parallelJoin?: 'ALL' | 'ANY'
  ccConfig?: { ccUserIds?: number[]; ccRoleIds?: number[]; ccField?: string | null } | null
}
type FrontendJsonDef = {
  nodes?: FrontendDefNode[]
  edges?: any[]
  viewport?: any
  onRejectAction?: string
  commentPolicy?: string
  globalTimeout?: any
}
function frontendDefToCanvas(def: FrontendJsonDef | null | undefined): CanvasData {
  if (!def || !Array.isArray(def.nodes)) return { nodes: [], edges: [], viewport: def?.viewport ?? { x: 0, y: 0, zoom: 1 } }
  const nodes: CanvasNode[] = def.nodes.map((n, idx) => {
    const typeRaw = (n.type ?? 'APPROVER_SINGLE') as EngineNodeType
    const engineType: EngineNodeType = KNOWN_NODE_TYPES.includes(typeRaw) ? typeRaw : 'APPROVER_SINGLE'
    const data: CanvasNode['data'] = {
      label: n.label ?? String(engineType),
      nodeType: engineType,
      approver: n.approver ?? null,
      condition: n.condition ?? null,
      timeout: n.timeout ?? null,
      onRejectAction: n.onRejectAction,
      allowAddCountersign: n.allowAddCountersign,
      allowTransfer: n.allowTransfer,
      requireComment: n.requireComment,
      parallelJoin: n.parallelJoin === 'ANY' ? 'ANY' : 'ALL',
      ccConfig: n.ccConfig ?? null,
    }
    return {
      id: n.key ?? `n_${idx}`,
      type: 'approval',
      position: n.position ?? { x: 120 + idx * 260, y: 240 },
      data,
    }
  })
  const edges: CanvasEdge[] = Array.isArray(def.edges) ? def.edges.map((e: any) => ({
    id: String(e.id ?? `e_${e.source ?? 's'}_${e.target ?? 't'}_${Math.random().toString(36).slice(2, 6)}`),
    source: String(e.source),
    target: String(e.target),
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
    label: e.label ?? undefined,
    style: e.style ?? undefined,
  })) : []
  return { nodes, edges, viewport: def.viewport ?? { x: 0, y: 0, zoom: 1 } }
}

// 统一解析入参：优先 body.canvasData，否则 body.jsonDefinition（前端自定义格式）尝试转 CanvasData
function resolveCanvasFromBody(body: any): { canvas: CanvasData; globals: any } {
  let globals: any = body.globals ?? {}
  if (body.canvasData && Array.isArray(body.canvasData.nodes)) {
    return { canvas: sanitizeCanvas(body.canvasData), globals }
  }
  if (body.jsonDefinition && Array.isArray(body.jsonDefinition.nodes)) {
    const def = body.jsonDefinition as FrontendJsonDef
    globals = {
      ...globals,
      onRejectDefault: globals.onRejectDefault ?? def.onRejectAction ?? undefined,
      commentPolicy: globals.commentPolicy ?? def.commentPolicy ?? undefined,
      timeout: globals.timeout ?? def.globalTimeout ?? undefined,
    }
    return { canvas: sanitizeCanvas(frontendDefToCanvas(def)), globals }
  }
  throw new Error('缺少画布数据（canvasData 或 jsonDefinition）')
}

function engineToCanvas(def: WorkflowDefinition | null | undefined): CanvasData {
  if (!def || !def.nodes) return { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }
  const nodes: CanvasNode[] = def.nodes.map((n, idx) => {
    const type: EngineNodeType = n.type as any ?? 'APPROVER_SINGLE'
    const data: CanvasNode['data'] = { label: n.name ?? type, nodeType: type }
    if (type.startsWith('APPROVER_')) {
      const ap = n.approver
      const kinds: string[] = []
      if (ap?.kind === 'FIELD') kinds.push('FIELD')
      else if (ap?.kind === 'USER') kinds.push('USER')
      else kinds.push('ROLE')
      data.approver = {
        approverKind: kinds,
        approverIds: ap?.kind === 'USER' ? (ap?.candidates ?? []) : [],
        approverRoleIds: ap?.kind === 'ROLE' ? (ap?.candidates ?? []) : [],
        fieldPicker: ap?.field ? { fieldName: ap.field, expects: 'USER_ID' } : null,
        minQuorum: ap?.quorum ?? null,
      }
    }
    if (type === 'CONDITION_BRANCH') {
      const expr0 = n.condition?.expressions?.[0] as any
      if (expr0 && expr0.field === '__expr__') data.condition = { expression: expr0.value }
      else if (expr0) {
        const reverseOp: Record<string, string> = { eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', in: 'in', contains: 'contains' }
        data.condition = {
          simpleField: expr0.field,
          simpleOp: reverseOp[expr0.op] ?? '==',
          simpleValue: typeof expr0.value === 'string' || typeof expr0.value === 'number' ? String(expr0.value) : JSON.stringify(expr0.value)
        }
      }
    }
    if (type === 'CC') {
      const c = n.ccTargets
      if (c?.kind === 'USER') data.ccConfig = { ccUserIds: c.ids ?? [], ccRoleIds: [], ccField: null }
      else if (c?.kind === 'ROLE') data.ccConfig = { ccUserIds: [], ccRoleIds: c.ids ?? [], ccField: null }
      else if (c?.kind === 'FIELD') data.ccConfig = { ccUserIds: [], ccRoleIds: [], ccField: c.field ?? null }
    }
    if (type === 'PARALLEL') data.parallelJoin = n.parallelWaitMode === 'ANY' ? 'ANY' : 'ALL'
    return {
      id: n.id, type: 'approval',
      position: { x: 120 + idx * 260, y: 240 },
      data,
    }
  })
  // edges
  const edges: CanvasEdge[] = []
  for (const n of def.nodes) {
    const addEdge = (tgt: string, hTrue: boolean | null) => {
      edges.push({
        id: `e_${n.id}__${tgt}__${hTrue === null ? 'any' : hTrue ? 'T' : 'F'}`,
        source: n.id, target: tgt,
        sourceHandle: hTrue === null ? null : hTrue ? 'true' : 'false',
        targetHandle: null,
      })
    }
    if (n.next) for (const t of n.next) addEdge(t, null)
    if (n.nextTrue) for (const t of n.nextTrue) addEdge(t, true)
    if (n.nextFalse) for (const t of n.nextFalse) addEdge(t, false)
  }
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
}

// ======== Handlers ========
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })
    const id = Number(params.id)
    const wf = await prisma.approvalWorkflow.findUnique({
      where: { id },
      include: {
        nodes: { orderBy: { id: 'asc' } },
        table: { select: { id: true, label: true, name: true, categoryId: true, approvalTriggerConfig: true, featureFlags: true } }
      }
    })
    if (!wf) return NextResponse.json({ message: '流程不存在' }, { status: 404 })

    // 优先返回 canvasData（设计器友好）。若只有 jsonDefinition，则回推 canvas
    const rawCanvas: any = (wf.canvasData as any)
    let canvas: CanvasData
    if (rawCanvas && Array.isArray(rawCanvas.nodes)) {
      canvas = rawCanvas
    } else {
      canvas = engineToCanvas(wf.jsonDefinition as any)
    }
    // 若没有 jsonDefinition，则从 canvas 生成（后续发布/保存时都会写）
    let jsonDef: WorkflowDefinition | null = wf.jsonDefinition as any
    if (!jsonDef) jsonDef = canvasToEngine(canvas)

    // Fallback: 完全没有数据时给一个空 START→END 骨架
    if (!jsonDef.nodes.length) {
      canvas = { nodes: [
        { id: 'start', type: 'approval', position: { x: 80, y: 240 }, data: { label: '开始', nodeType: 'START' } },
        { id: 'end', type: 'approval', position: { x: 520, y: 240 }, data: { label: '结束', nodeType: 'END' } },
      ], edges: [{ id: 'e_start_end', source: 'start', target: 'end' }], viewport: { x: 0, y: 0, zoom: 1 } }
      jsonDef = canvasToEngine(canvas)
    }

    return NextResponse.json({ ok: true, data: { workflow: wf, workflowName: wf.name, canvasData: canvas, jsonDefinition: jsonDef, table: wf.table } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '获取失败' }, { status: 500 })
  }
}

function sanitizeCanvas(c: any): CanvasData {
  if (!c || !Array.isArray(c.nodes)) throw new Error('画布缺少 nodes 数组')
  const ids = new Set<string>()
  for (const n of c.nodes) {
    if (!n.id || typeof n.id !== 'string') throw new Error('节点缺少 id')
    if (ids.has(n.id)) throw new Error(`重复节点 id: ${n.id}`)
    ids.add(n.id)
    if (!KNOWN_NODE_TYPES.includes(n.data?.nodeType)) throw new Error(`未知节点类型: ${n.data?.nodeType}`)
  }
  return c as CanvasData
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) return NextResponse.json({ message: '无权限' }, { status: 403 })
    const id = Number(params.id)
    const body = await req.json()
    const wf = await prisma.approvalWorkflow.findUnique({ where: { id } })
    if (!wf) return NextResponse.json({ message: '流程不存在' }, { status: 404 })
    const { canvas, globals } = resolveCanvasFromBody(body)
    const jsonDef = canvasToEngine(canvas, globals)

    const updated = await prisma.approvalWorkflow.update({
      where: { id },
      data: {
        name: globals.name && typeof globals.name === 'string' ? globals.name.trim().slice(0, 200) : undefined,
        description: globals.description != null && typeof globals.description === 'string' ? globals.description.slice(0, 1000) : undefined,
        canvasData: canvas as any,
        jsonDefinition: jsonDef as any,
        // 流程启动条件：支持 null 清空 / 数组 / 对象
        triggerCondition:
          globals.triggerCondition === null || globals.triggerCondition === undefined
            ? Prisma.JsonNull
            : (globals.triggerCondition as any),
        // 专项动作审批配置
        specialAction:
          globals.specialAction === null || globals.specialAction === undefined
            ? Prisma.JsonNull
            : (globals.specialAction as any),
      }
    })
    return NextResponse.json({ ok: true, data: { status: updated.status, version: updated.version } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '保存失败' }, { status: 400 })
  }
}

/**
 * POST 发布：
 *   - 校验画布完整性（有 START/END、审批人节点配置了审批人、每个非 END 有出边）
 *   - 版本自增；若 isDefault 则切为 ACTIVE，否则 PUBLISHED
 *   - 同步写 ApprovalNode 表（兼容旧读取）
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) return NextResponse.json({ message: '无权限' }, { status: 403 })
    const id = Number(params.id)
    const body = await req.json()
    const wf = await prisma.approvalWorkflow.findUnique({ where: { id } })
    if (!wf) return NextResponse.json({ message: '流程不存在' }, { status: 404 })
    const { canvas, globals } = resolveCanvasFromBody(body)
    const jsonDef = canvasToEngine(canvas, globals)

    // 完整性校验
    const byId = new Map(jsonDef.nodes.map(n => [n.id, n]))
    if (!jsonDef.nodes.some(n => n.type === 'START')) throw new Error('缺少“开始”节点')
    if (!jsonDef.nodes.some(n => n.type === 'END')) throw new Error('缺少“结束”节点')
    for (const n of jsonDef.nodes) {
      if (n.type === 'START' || n.type === 'END') continue
      if (n.type.startsWith('APPROVER_')) {
        const ap = n.approver
        if (!ap?.kind || (!ap.candidates?.length && !ap.field)) {
          throw new Error(`审批节点「${n.name ?? n.id}」未配置审批人来源`)
        }
      }
      // 出边必须有（非 END）
      if ((n.next?.length || n.nextTrue?.length || n.nextFalse?.length) === 0) {
        throw new Error(`节点「${n.id}」没有出边`)
      }
      if (n.type === 'CONDITION_BRANCH' && (!n.nextTrue?.length || !n.nextFalse?.length)) {
        throw new Error(`条件分支「${n.id}」必须同时有 TRUE 和 FALSE 两条出边`)
      }
    }

    const publishedVersion = (wf.version ?? 1) + 1
    const setActive = wf.isDefault ? 'ACTIVE' : 'PUBLISHED'

    // 同步 ApprovalNode：先删后建（精简 Schema：仅保留 nodeKey/nodeType/nodeName）
    const ordered = [...canvas.nodes].sort((a, b) => (a.position.x - b.position.x) + (a.position.y - b.position.y) * 0.0001)

    await prisma.$transaction(async (tx: any) => {
      await tx.approvalNode.deleteMany({ where: { workflowId: id } })
      if (ordered.length) {
        const rows = ordered.map((cn) => {
          const t: EngineNodeType = cn.data.nodeType ?? 'APPROVER_SINGLE'
          return {
            workflowId: id,
            nodeKey: cn.id,
            nodeType: t,
            nodeName: cn.data.label,
          }
        })
        await tx.approvalNode.createMany({ data: rows as any })
      }
      await tx.approvalWorkflow.update({
        where: { id },
        data: {
          name: globals.name && typeof globals.name === 'string' ? globals.name.trim().slice(0, 200) : undefined,
          description: globals.description != null && typeof globals.description === 'string' ? globals.description.slice(0, 1000) : undefined,
          canvasData: canvas as any,
          jsonDefinition: jsonDef as any,
          triggerCondition:
            globals.triggerCondition === null || globals.triggerCondition === undefined
              ? Prisma.JsonNull
              : (globals.triggerCondition as any),
          specialAction:
            globals.specialAction === null || globals.specialAction === undefined
              ? Prisma.JsonNull
              : (globals.specialAction as any),
          version: publishedVersion,
          status: setActive as any,
          publishedAt: new Date(),
          publishedBy: user.id,
        }
      })
    })
    return NextResponse.json({ ok: true, data: { publishedVersion, status: setActive, syncedNodes: ordered.length } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '发布失败' }, { status: 400 })
  }
}
