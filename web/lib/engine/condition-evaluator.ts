/**
 * 条件求值器 — 纯函数，无 DB 依赖
 *
 * 对 WorkflowNodeDef 的 condition 配置求值，返回 boolean。
 * 支持 AND 组合 + OR 组合两种模式。
 */
import type { CondExpr, WorkflowNodeDef, ConditionConfig } from './types'

// ─── 内部工具 ──────────────────────────────────────────────────

function castNumber(v: any): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** 求值单个表达式 */
function evalOne(expr: CondExpr, data: Record<string, any>): boolean {
  const { field, op, value } = expr
  const raw = data[field]

  switch (op) {
    case 'eq':
      return String(raw ?? '') === String(value ?? '')
    case 'ne':
      return String(raw ?? '') !== String(value ?? '')
    case 'gt': {
      const a = castNumber(raw)
      const b = castNumber(value)
      if (a == null || b == null) return false
      return a > b
    }
    case 'gte': {
      const a = castNumber(raw)
      const b = castNumber(value)
      if (a == null || b == null) return false
      return a >= b
    }
    case 'lt': {
      const a = castNumber(raw)
      const b = castNumber(value)
      if (a == null || b == null) return false
      return a < b
    }
    case 'lte': {
      const a = castNumber(raw)
      const b = castNumber(value)
      if (a == null || b == null) return false
      return a <= b
    }
    case 'in': {
      const arr = Array.isArray(value) ? value : [value]
      return arr.includes(raw)
    }
    case 'contains':
      return typeof raw === 'string' && typeof value === 'string' && raw.includes(value)
    case 'empty':
      return raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)
    case 'nempty':
      return !(raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0))
    default:
      return false
  }
}

// ─── 公开 API ──────────────────────────────────────────────────

/**
 * 对条件配置求值
 *
 * @param condition 条件配置（来自 WorkflowNodeDef.condition）
 * @param data 记录数据（record.data）
 * @returns 条件是否满足
 */
export function evaluateConditionConfig(
  condition: ConditionConfig | undefined,
  data: Record<string, any>
): boolean {
  if (!condition) return true

  // OR 组合优先：若有 orExpressions，则任一子组全部满足即为 TRUE
  if (condition.orExpressions && Array.isArray(condition.orExpressions)) {
    if (condition.orExpressions.length === 0) return true
    return condition.orExpressions.some(
      andArr => (andArr ?? []).every(e => evalOne(e, data))
    )
  }

  // AND 组合：所有表达式都满足
  const andArr = condition.expressions ?? []
  if (andArr.length === 0) return true
  return andArr.every(e => evalOne(e, data))
}

/**
 * 对节点的条件分支求值（便捷封装）
 *
 * @param node WorkflowNodeDef（需 type=CONDITION_BRANCH）
 * @param data 记录数据
 * @returns TRUE 走 nextTrue，FALSE 走 nextFalse
 */
export function evaluateNodeCondition(
  node: WorkflowNodeDef,
  data: Record<string, any>
): boolean {
  return evaluateConditionConfig(node.condition, data)
}

/**
 * 对单个表达式求值（导出供外部使用）
 */
export { evalOne as evaluateOneExpression }
export type { CondExpr }
