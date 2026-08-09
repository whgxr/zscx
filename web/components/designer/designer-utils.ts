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
