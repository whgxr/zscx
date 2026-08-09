// v1.2.2+ 数据快照 / 字段级差异工具
// 用途：
// 1. deepDiff 比较修改前后的 data JSON，生成 { field: {before, after} }
// 2. createRecordSnapshot 在 data record 的 create/update/delete/sync-apply 等
//    操作前后落 DataSnapshot 表，供审计中心 & 同步请求引用
// 3. applyFieldDiffs 将审批通过的 fieldDiffs 合并到目标记录 data

import { prisma } from './prisma'
import type { DataSnapshot } from '@prisma/client'

export type FieldDiffMap = Record<string, { before?: any; after?: any }>

/** 基础深比较；忽略 undefined/null 值差异 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a === null || b === null) return a === b
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!isEqual(a[i], b[i])) return false
    }
    return true
  }
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!keysB.includes(k)) return false
    if (!isEqual(a[k], b[k])) return false
  }
  return true
}

/**
 * 生成两个 data JSON 的字段级差异。
 * 顶层是普通对象（字段名 -> 值），因此只要顶层字段 before/after 不同就记录。
 */
export function deepDiff(
  before: Record<string, any> | null | undefined,
  after: Record<string, any> | null | undefined
): FieldDiffMap {
  const diff: FieldDiffMap = {}
  const b = before || {}
  const a = after || {}
  const keys = new Set([...Object.keys(b), ...Object.keys(a)])
  for (const k of keys) {
    if (!isEqual(b[k], a[k])) {
      diff[k] = { before: b[k], after: a[k] }
    }
  }
  return diff
}

/** 差异的字段数量（0 表示无变化） */
export function diffSize(diff: FieldDiffMap): number {
  return Object.keys(diff).length
}

export type ChangeType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SYNC_APPLY'
  | 'SYNC_REJECT'
  | 'LEVY_APPROVE_APPLY'
  | 'LEVY_APPROVE_REJECT'

export interface SnapshotCreateInput {
  tableId: number
  recordId: number
  beforeData?: Record<string, any> | null
  afterData?: Record<string, any> | null
  changedBy?: number | null
  changeType: ChangeType
  metadata?: Record<string, any> | null
}

export async function createRecordSnapshot(
  input: SnapshotCreateInput
): Promise<DataSnapshot> {
  const diff = deepDiff(input.beforeData || {}, input.afterData || {})
  return prisma.dataSnapshot.create({
    data: {
      tableId: input.tableId,
      recordId: input.recordId,
      beforeData: (input.beforeData as any) ?? null,
      afterData: (input.afterData as any) ?? null,
      changedBy: input.changedBy ?? null,
      changeType: input.changeType,
      diff: (diff as any) ?? null,
      metadata: (input.metadata as any) ?? null,
    },
  })
}

/**
 * 把 fieldDiffs 的 after 值合并进 targetData（用于“审批通过后应用同步”）。
 * 返回新对象，不改变原对象。
 */
export function applyFieldDiffs(
  targetData: Record<string, any>,
  fieldDiffs: FieldDiffMap
): Record<string, any> {
  const next: Record<string, any> = { ...(targetData || {}) }
  for (const [field, entry] of Object.entries(fieldDiffs)) {
    // 用 diff.after（审批通过的是调查侧最新 after 值）；若 after 不存在，视为删除该字段（设 undefined）
    if (Object.prototype.hasOwnProperty.call(entry, 'after')) {
      next[field] = entry.after
    } else {
      delete next[field]
    }
  }
  return next
}
