/**
 * 审批通用展示工具：状态中文标签 + 专项动作修改差异计算
 * 供「待办 / 我的发起 / 已审批」等审批列表页复用
 */

export const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING: 'bg-sky-100 text-sky-800 border-sky-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  REVOKED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
  AUTO_PASSED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  AUTO_REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  RESTARTED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}

/** 审批实例状态 -> 中文标签 */
export const STATUS_LABEL: Record<string, string> = {
  PENDING: '处理中',
  PROCESSING: '处理中',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  REVOKED: '已撤回',
  CANCELLED: '已取消',
  AUTO_PASSED: '已通过',
  AUTO_REJECTED: '已驳回',
  RESTARTED: '已重启',
}

export type DiffEntry = { label: string; name: string; oldVal: string; newVal: string; type: string }

function parseSpecialAction(raw: any): any {
  if (!raw) return null
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return null } }
  return raw
}

function parseData(raw: any): any {
  if (!raw) return {}
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
  return raw
}

function fmtVal(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    try { return JSON.stringify(v) } catch { return String(v) }
  }
  return String(v)
}

/**
 * 计算专项动作审批修改了哪些字段（旧值 → 新值）
 * row 需包含 workflow.specialAction / snapshotDataBefore / snapshotDataAfter
 */
export function buildDiff(row: any): DiffEntry[] {
  const sa = parseSpecialAction(row?.workflow?.specialAction)
  const actionType = sa?.actionType ?? 'UPDATE'
  const before = parseData(row?.snapshotDataBefore)
  const after = parseData(row?.snapshotDataAfter)

  // 字段名 -> 中文标签
  const labelMap: Record<string, string> = {}
  ;(sa?.editableFields ?? []).forEach((f: any) => { if (f?.name) labelMap[f.name] = f.label || f.name })
  const labelOf = (name: string) => labelMap[name] || name

  if (actionType === 'CREATE') {
    const keys = Object.keys(after).filter(k => fmtVal(after[k]) !== '')
    return keys.map(k => ({ label: labelOf(k), name: k, oldVal: '', newVal: fmtVal(after[k]), type: 'CREATE' }))
  }
  if (actionType === 'DELETE') {
    return [{ label: '', name: '', oldVal: '', newVal: '', type: 'DELETE' }]
  }
  if (actionType === 'REVIEW') {
    return [{ label: '', name: '', oldVal: '', newVal: '', type: 'REVIEW' }]
  }

  // UPDATE：对比 before / after
  const changed: DiffEntry[] = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const k of allKeys) {
    const o = fmtVal(before[k])
    const n = fmtVal(after[k])
    if (o !== n) changed.push({ label: labelOf(k), name: k, oldVal: o, newVal: n, type: 'UPDATE' })
  }
  return changed
}

/** 解析专项动作配置 */
export function parseSpecialActionOf(row: any): any {
  return parseSpecialAction(row?.workflow?.specialAction)
}

/** 根据动作类型返回中文动作描述 */
export function actionSummary(row: any): { type: string; label: string } {
  const sa = parseSpecialAction(row?.workflow?.specialAction)
  const t = sa?.actionType ?? 'UPDATE'
  const map: Record<string, string> = {
    CREATE: '新增记录', UPDATE: '修改记录', DELETE: '删除记录', REVIEW: '审查复核',
  }
  return { type: t, label: map[t] ?? t }
}