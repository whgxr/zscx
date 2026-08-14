/**
 * 设计器工具函数
 *
 * 序列化/反序列化、校验、默认节点工厂、uuid 生成。
 */
import type { DesignerNodeDef, DesignerGlobals, DesignerState, NodeType, WorkflowNodeDef } from './designer-types'

// ─── UUID 生成 ─────────────────────────────────────────────────

export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─── 默认节点工厂 ──────────────────────────────────────────────

const DEFAULT_NAMES: Record<string, string> = {
  START: '开始',
  END: '结束',
  APPROVER_SINGLE: '审批人',
  APPROVER_COUNTERSIGN: '会签',
  APPROVER_ORSIGN: '或签',
  CONDITION_BRANCH: '条件分支',
  PARALLEL: '并行',
  CC: '抄送',
}

/** 创建新的默认节点定义 */
export function createDefaultNode(type: NodeType, position: { x: number; y: number }): DesignerNodeDef {
  const id = uuid()
  const name = DEFAULT_NAMES[type] ?? type
  return {
    id,
    type,
    name,
    position,
  }
}

/** 创建初始空画布（START → END） */
export function createEmptyState(): DesignerState {
  return {
    nodes: [
      { id: uuid(), type: 'START', name: '开始', position: { x: 80, y: 240 } },
      { id: uuid(), type: 'END', name: '结束', position: { x: 520, y: 240 } },
    ],
    globals: {
      allowTransfer: true,
      allowAddCountersign: false,
      onRejectDefault: 'REJECT_INSTANCE',
    },
  }
}

// ─── 序列化 ────────────────────────────────────────────────────

/**
 * 设计器状态 → jsonDefinition（引擎用）
 * 去掉 position 字段（画布坐标不存入引擎定义）
 */
export function stateToDefinition(state: DesignerState): { nodes: WorkflowNodeDef[]; globals: any } {
  const nodes: WorkflowNodeDef[] = state.nodes.map(n => {
    const { position, ...def } = n
    return def
  })
  return { nodes, globals: state.globals }
}

/**
 * 设计器节点 → 画布节点 data（ReactFlow data 格式）
 * 与后端 engineToCanvas 的 data 结构保持一致（approver/condition/ccConfig/parallelJoin）
 */
export function designerNodeToCanvasData(n: DesignerNodeDef): any {
  const type = n.type
  const data: any = { label: n.name ?? type, nodeType: type }
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
    const expr0 = (n.condition?.expressions as any)?.[0]
    if (expr0 && expr0.field === '__expr__') data.condition = { expression: expr0.value }
    else if (expr0) {
      const reverseOp: Record<string, string> = { eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', in: 'in', contains: 'contains' }
      data.condition = {
        simpleField: expr0.field,
        simpleOp: reverseOp[expr0.op] ?? '==',
        simpleValue: typeof expr0.value === 'string' || typeof expr0.value === 'number' ? String(expr0.value) : JSON.stringify(expr0.value),
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
  return data
}

/**
 * 设计器状态 → 完整画布（CanvasData）
 * 含节点配置（approver/condition/ccConfig/parallelJoin）+ 由节点连接派生的 edges，
 * 与后端 engineToCanvas / canvasToEngine 往返一致。
 */
export function stateToCanvas(state: DesignerState): any {
  const nodes = state.nodes.map(n => ({
    id: n.id, type: 'approval', position: n.position,
    data: designerNodeToCanvasData(n),
  }))
  const edges: any[] = []
  const addEdge = (source: string, tgt: string, hTrue: boolean | null) => {
    edges.push({
      id: `e_${source}__${tgt}__${hTrue === null ? 'any' : hTrue ? 'T' : 'F'}`,
      source, target: tgt,
      sourceHandle: hTrue === null ? null : hTrue ? 'true' : 'false',
      targetHandle: null,
    })
  }
  for (const n of state.nodes) {
    if (n.next) for (const t of n.next) addEdge(n.id, t, null)
    if (n.nextTrue) for (const t of n.nextTrue) addEdge(n.id, t, true)
    if (n.nextFalse) for (const t of n.nextFalse) addEdge(n.id, t, false)
  }
  return { nodes, edges, viewport: { x: 0, y: 0, zoom: 1 } }
}

/**
 * jsonDefinition + canvasData → 设计器状态
 */
export function definitionToState(
  jsonDef: any,
  canvasData?: any,
): DesignerState {
  if (!jsonDef?.nodes?.length) return createEmptyState()

  // 从 canvasData 中恢复 position
  const canvasPositions: Record<string, { x: number; y: number }> = {}
  if (canvasData?.nodes) {
    for (const cn of canvasData.nodes) {
      if (cn.id && cn.position) canvasPositions[cn.id] = cn.position
    }
  }

  const nodes: DesignerNodeDef[] = jsonDef.nodes.map((n: any, idx: number) => ({
    ...n,
    position: canvasPositions[n.id] ?? { x: 120 + idx * 260, y: 240 },
  }))

  const globals: DesignerGlobals = {
    allowTransfer: jsonDef.globals?.allowTransfer ?? true,
    allowAddCountersign: jsonDef.globals?.allowAddCountersign ?? false,
    onRejectDefault: jsonDef.globals?.onRejectDefault ?? 'REJECT_INSTANCE',
    commentPolicy: jsonDef.globals?.commentPolicy,
    timeout: jsonDef.globals?.timeout,
  }

  return { nodes, globals }
}

// ─── 校验 ──────────────────────────────────────────────────────

export type ValidationError = { node: string; message: string }

/** 校验设计器状态，返回错误列表（空数组表示通过） */
export function validateState(state: DesignerState): ValidationError[] {
  const errors: ValidationError[] = []
  const hasStart = state.nodes.some(n => n.type === 'START')
  const hasEnd = state.nodes.some(n => n.type === 'END')
  if (!hasStart) errors.push({ node: '', message: '缺少"开始"节点' })
  if (!hasEnd) errors.push({ node: '', message: '缺少"结束"节点' })

  for (const n of state.nodes) {
    if (n.type.startsWith('APPROVER_') && n.type !== 'START' && n.type !== 'END') {
      if (!n.approver?.kind || (!n.approver.candidates?.length && !n.approver.field)) {
        errors.push({ node: n.id, message: `审批节点「${n.name}」未配置审批人` })
      }
    }
  }

  return errors
}
