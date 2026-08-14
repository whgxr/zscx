/**
 * 设计器 UI 类型定义
 *
 * 扩展引擎 WorkflowNodeDef，增加 ReactFlow 画布所需的 UI 属性。
 * 设计器与引擎共享 WorkflowNodeDef 类型，不再有格式转换。
 */
import type { WorkflowNodeDef, NodeType, WorkflowDefinition, CondExpr } from '@/lib/engine'

export type { WorkflowNodeDef, NodeType, WorkflowDefinition, CondExpr }

// ─── 设计器节点定义（存储在 canvasData 中） ────────────────────
export type DesignerNodeDef = WorkflowNodeDef & {
  /** 画布坐标 */
  position: { x: number; y: number }
}

// ─── 全局设置 ──────────────────────────────────────────────────
export type DesignerGlobals = {
  allowTransfer: boolean
  allowAddCountersign: boolean
  onRejectDefault: string
  commentPolicy?: string
  timeout?: { defaultHours: number; defaultAction: string }
  /** 工作流名称（与 DB 字段同步） */
  name?: string
  /** 工作流描述（与 DB 字段同步） */
  description?: string
  /** 流程启动条件（按条件选审批类型，数组=AND 表达式；或完整 {expressions,orExpressions}），不存引擎 jsonDefinition 而存 ApprovalWorkflow.triggerCondition */
  triggerCondition?: any
  /** v1.2.3+ 专项动作审批配置：{ actionType, targetTableId, targetTableLabel, editableFields[], dataScope[], visibleRoleIds[] } */
  specialAction?: any
}

// ─── 设计器完整状态 ───────────────────────────────────────────
export type DesignerState = {
  nodes: DesignerNodeDef[]
  globals: DesignerGlobals
}

// ─── 节点调色板配置 ────────────────────────────────────────────
export type PaletteItem = {
  type: NodeType
  label: string
  icon: string
  color: string
  description: string
}

export const PALETTE_ITEMS: PaletteItem[] = [
  { type: 'APPROVER_SINGLE',      label: '审批人',   icon: 'UserCheck',    color: '#3b82f6', description: '单人审批' },
  { type: 'APPROVER_COUNTERSIGN', label: '会签',     icon: 'Users',        color: '#6366f1', description: '多人会签' },
  { type: 'APPROVER_ORSIGN',      label: '或签',     icon: 'UserPlus',     color: '#8b5cf6', description: '任一通过' },
  { type: 'CONDITION_BRANCH',     label: '条件分支', icon: 'GitBranch',    color: '#f59e0b', description: '条件判断' },
  { type: 'PARALLEL',             label: '并行',     icon: 'Layers',       color: '#10b981', description: '并行分支' },
  { type: 'CC',                   label: '抄送',     icon: 'Mail',         color: '#6b7280', description: '抄送通知' },
]

// ─── 节点颜色映射 ──────────────────────────────────────────────
export const NODE_COLORS: Record<string, string> = {
  START:                '#22c55e',
  END:                  '#ef4444',
  APPROVER_SINGLE:      '#3b82f6',
  APPROVER_COUNTERSIGN: '#6366f1',
  APPROVER_ORSIGN:      '#8b5cf6',
  CONDITION_BRANCH:     '#f59e0b',
  PARALLEL:             '#10b981',
  CC:                   '#6b7280',
}
