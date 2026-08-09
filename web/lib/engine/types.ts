/**
 * 审批引擎 — 统一类型定义
 *
 * 设计器与引擎共用同一套类型，不再有 DefNode vs JsonDefinitionNode 的转换问题。
 * 所有节点配置直接存于 WorkflowNodeDef 内，不再从 ApprovalNode DB 字段中读取。
 */

// ─── 节点类型 ──────────────────────────────────────────────────
export const NODE_TYPES = [
  'START', 'END',
  'APPROVER_SINGLE', 'APPROVER_COUNTERSIGN', 'APPROVER_ORSIGN',
  'CONDITION_BRANCH', 'PARALLEL', 'CC',
] as const

export type NodeType = (typeof NODE_TYPES)[number]

// ─── 条件表达式 ─────────────────────────────────────────────────
export type CondOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'empty' | 'nempty'

export type CondExpr = {
  field: string
  op: CondOp
  value: any
}

// ─── 审批人配置 ─────────────────────────────────────────────────
export type ApproverKind = 'ROLE' | 'USER' | 'FIELD' | 'CREATOR' | 'LAST_APPROVER' | 'DEPARTMENT'

export type ApproverConfig = {
  kind: ApproverKind
  /** userId 或 roleId 列表（kind=USER/ROLE 时使用） */
  candidates?: number[]
  /** kind=FIELD 时的字段名列表 */
  field?: string
  /** 会签法定百分比（1~100），仅 COUNTERSIGN 节点使用，默认 100 */
  quorum?: number
}

// ─── 条件分支配置 ───────────────────────────────────────────────
export type ConditionConfig = {
  /** AND 组合：所有表达式都满足时为 TRUE */
  expressions: CondExpr[]
  /** OR 组合：任一子组满足时为 TRUE（每个子组内 AND） */
  orExpressions?: CondExpr[][]
}

// ─── 抄送配置 ──────────────────────────────────────────────────
export type CcTarget = {
  kind: 'ROLE' | 'USER' | 'FIELD'
  ids?: number[]
  field?: string
}

// ─── 超时策略 ──────────────────────────────────────────────────
export type TimeoutAction = 'AUTO_PASS' | 'AUTO_REJECT' | 'ESCALATE' | 'NONE'

export type TimeoutConfig = {
  hours: number
  action: TimeoutAction
}

// ─── 驳回策略 ──────────────────────────────────────────────────
export type RejectAction = 'REJECT_INSTANCE' | 'GOTO_PREVIOUS' | 'GOTO_NODE' | 'RESTART'

// ─── DAG 节点定义（存于 jsonDefinition.nodes） ─────────────────
export type WorkflowNodeDef = {
  /** 稳定 key（uuid），与 ApprovalNode.nodeKey 对应 */
  id: string
  type: NodeType
  /** 展示名称 */
  name: string

  // ── 连接关系 ──
  /** 后继节点（普通/并行分支） */
  next?: string[]
  /** 条件分支 TRUE 路径 */
  nextTrue?: string[]
  /** 条件分支 FALSE 路径 */
  nextFalse?: string[]
  /** 前驱节点（由设计器/引擎自动维护） */
  prev?: string[]

  // ── APPROVER 节点配置 ──
  approver?: ApproverConfig

  // ── 条件分支配置 ──
  condition?: ConditionConfig

  // ── 并行配置 ──
  parallelWaitMode?: 'ALL' | 'ANY'

  // ── 抄送配置 ──
  ccTargets?: CcTarget

  // ── 超时策略 ──
  timeout?: TimeoutConfig

  // ── 驳回策略 ──
  onReject?: RejectAction
  /** onReject=GOTO_NODE 时的目标节点 key */
  gotoNodeKey?: string
}

// ─── jsonDefinition 全局配置 ───────────────────────────────────
export type WorkflowGlobals = {
  allowTransfer?: boolean
  allowAddCountersign?: boolean
  onRejectDefault?: RejectAction
  notify?: any
  engine?: string
}

// ─── 完整 jsonDefinition 结构 ──────────────────────────────────
export type WorkflowDefinition = {
  nodes: WorkflowNodeDef[]
  globals?: WorkflowGlobals
}

// ─── 引擎输入/输出类型 ─────────────────────────────────────────

export type StartInstanceOpts = {
  workflowId: number
  tableId: number
  recordId: number
  initiatorId: number | null
  triggerEvent: string
  recordDataBefore: Record<string, any> | null
  recordDataAfter?: Record<string, any> | null
  optimisticLock?: Date
  parentInstanceId?: number | null
  ip?: string | null
  ua?: string | null
  /** 如果已在外部开启事务，传入 */
  tx?: any
}

export type ApplyActionOpts = {
  nodeInstanceId: number
  assigneeId: number
  action: 'APPROVE' | 'REJECT' | 'TRANSFER' | 'TIMEOUT_PASS' | 'TIMEOUT_REJECT'
  comment?: string | null
  transferredTo?: number | null
  transferredFrom?: number | null
  addCountersignIds?: number[]
  gotoNodeKey?: string | null
  restartNewInstanceId?: number | null
  ip?: string | null
  ua?: string | null
  /** 如果已在外部开启事务，传入 */
  tx?: any
}

export type ActionResult = {
  status: string
  instanceStatus?: string | null
  finished: boolean
  nextNodeKeys?: string[]
  newAssignees?: { nodeId: number; nodeKey: string | null; assigneeIds: number[] }[]
  ccTargets?: number[]
}

export type StartResult = {
  instanceId: number
  initialAssignees: { nodeId: number; nodeKey: string | null; assigneeIds: number[] }[]
  ccUserIds: number[]
  record: any
  workflow: any
}

// ─── 工具函数 ──────────────────────────────────────────────────

export function deepParse<T = any>(val: any): T {
  if (val == null) return val as T
  if (typeof val === 'string') return JSON.parse(val) as T
  return val as T
}

/** 解析 workflow.jsonDefinition，返回 WorkflowDefinition 或 null */
export function parseDefinition(wf: { jsonDefinition?: any }): WorkflowDefinition | null {
  try {
    const jd = deepParse<WorkflowDefinition>(wf.jsonDefinition)
    if (!jd || !jd.nodes || !Array.isArray(jd.nodes)) return null
    return jd
  } catch {
    return null
  }
}

/** 按 id 查找节点定义 */
export function nodeById(def: WorkflowDefinition, id: string): WorkflowNodeDef | undefined {
  return def.nodes.find(n => n.id === id)
}

/** 获取 START 节点 key */
export function startKey(def: WorkflowDefinition): string | undefined {
  return def.nodes.find(n => n.type === 'START')?.id
}

/** 获取所有 END 节点 key */
export function endKeys(def: WorkflowDefinition): string[] {
  return def.nodes.filter(n => n.type === 'END').map(n => n.id)
}

/** 判断是否为审批人节点类型 */
export function isApproverType(type: string): boolean {
  return type === 'APPROVER_SINGLE' || type === 'APPROVER_COUNTERSIGN' || type === 'APPROVER_ORSIGN'
}

// ─── 向后兼容别名（旧引擎类型名，Phase 6 清理） ────────────

/** @deprecated 使用 WorkflowDefinition */
export type JsonDefinition = WorkflowDefinition
/** @deprecated 使用 WorkflowNodeDef */
export type JsonDefinitionNode = WorkflowNodeDef
