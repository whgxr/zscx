// v1.2.2+ 征收模块 - 调查数据变更同步检测器
//
// 触发时机：在调查侧（survey record）create/update/delete 之后，或
//         征收侧创建 LEVY_RELATION 链接完成后。
// 处理流程：
//   1. 找出目标调查表的所有 LEVY_RELATION 字段（引用调查侧数据表）
//   2. 找出关联的征收记录（Levy Table 中，对应 LEVY_RELATION 字段存储了 surveyRecordId）
//   3. 比较当前调查快照数据 vs 征收记录 data 中同字段的值，生成 fieldDiffs
//   4. 写入 DataSnapshot + DataSyncRequest(PENDING)
//   5. 把征收记录 status 置为 SYNC_PENDING（触发前端徽标）
//
// 审批通过后的应用：见 applyApprovedSyncRequest()

import { prisma } from './prisma'
import {
  createRecordSnapshot,
  deepDiff,
  applyFieldDiffs,
  diffSize,
  type FieldDiffMap,
} from './snapshot-utils'
import type {
  DataSyncRequest,
  SyncRequestStatus,
  SyncSource,
} from '@prisma/client'

export interface LevyRelationConfig {
  targetTableId: number
  cardinality: 'ONE_TO_ONE' | 'ONE_TO_MANY'
  syncMode: 'SNAPSHOT_APPROVAL' | 'DIRECT' | 'NONE'
}

export function parseLevyRelationConfig(fieldCfg: any): LevyRelationConfig | null {
  if (!fieldCfg) return null
  const raw = fieldCfg.levy || fieldCfg.LevyRelation || null
  if (!raw) return null
  const targetTableId = Number(raw.targetTableId)
  if (!targetTableId || isNaN(targetTableId)) return null
  return {
    targetTableId,
    cardinality: raw.cardinality || 'ONE_TO_ONE',
    syncMode: raw.syncMode || 'SNAPSHOT_APPROVAL',
  }
}

/**
 * 找出所有以 surveyTableId 为 “targetTableId” 的 LEVY_RELATION 字段
 * 即：所有“引用这张调查表”的征收字段。
 */
async function findLevyRelationFieldsReferencing(
  surveyTableId: number
): Promise<Array<{ fieldId: number; levyTableId: number; fieldName: string; config: LevyRelationConfig }>> {
  const all = await prisma.tableField.findMany({
    where: { type: 'LEVY_RELATION' },
    select: { id: true, tableId: true, name: true, config: true },
  })
  const res: Array<{ fieldId: number; levyTableId: number; fieldName: string; config: LevyRelationConfig }> = []
  for (const f of all) {
    const cfg = parseLevyRelationConfig(f.config)
    if (cfg && cfg.targetTableId === surveyTableId) {
      res.push({ fieldId: f.id, levyTableId: f.tableId, fieldName: f.name, config: cfg })
    }
  }
  return res
}

/**
 * 核心入口：当某条调查记录发生修改后，扫描所有“引用这张调查表”的征收记录，
 * 为每对（surveyRecord, levyRecord）比较差异并生成一条 DataSyncRequest。
 */
export async function triggerSyncForSurveyRecordIfNeeded(params: {
  surveyTableId: number
  surveyRecordId: number
  newSurveyData: Record<string, any>
  oldSurveyData?: Record<string, any> | null
  changedBy?: number | null
  changeType: 'CREATE' | 'UPDATE' | 'DELETE'
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<{ snapshotId: number | null; syncRequestIds: number[] }> {
  const {
    surveyTableId,
    surveyRecordId,
    newSurveyData,
    oldSurveyData,
    changedBy,
    changeType,
    ipAddress,
    userAgent,
  } = params

  // 0. 先落调查侧的修改快照（OperationLog 稍后记录）
  const snapshot = await createRecordSnapshot({
    tableId: surveyTableId,
    recordId: surveyRecordId,
    beforeData: oldSurveyData || null,
    afterData: newSurveyData || null,
    changedBy: changedBy ?? null,
    changeType,
    metadata: { ipAddress, userAgent, side: 'survey' },
  })

  // 1. 找出“引用该调查表”的所有 LEVY_RELATION 字段
  const levyRelationFields = await findLevyRelationFieldsReferencing(surveyTableId)
  if (levyRelationFields.length === 0) {
    return { snapshotId: snapshot.id, syncRequestIds: [] }
  }

  const syncRequestIds: number[] = []

  // 2. 对每个 LEVY_RELATION 字段，查该 levy 表中所有通过该字段引用 surveyRecordId 的记录
  for (const lf of levyRelationFields) {
    if (lf.config.syncMode === 'NONE') continue

    const levyRecords = await prisma.dataRecord.findMany({
      where: {
        tableId: lf.levyTableId,
        // data.<lf.fieldName> == surveyRecordId
        // data JSON 查询；MySQL 5.7+ 支持 JSON_EXTRACT / CAST；这里退化为全表扫描然后在内存过滤
        // （对单租户定制化系统可接受；后期可改成 generated column + index）
      },
      select: { id: true, data: true, status: true },
    })

    // 内存过滤 LEVY_RELATION 字段值 === surveyRecordId 的记录
    const matched = levyRecords.filter((lr: any) => {
      const d = (lr.data as Record<string, any>) || {}
      const v = d[lf.fieldName]
      if (v === undefined || v === null) return false
      return Number(v) === Number(surveyRecordId)
    })

    for (const levyRec of matched) {
      const levyData = (levyRec.data as Record<string, any>) || {}
      // 计算 调查侧当前 after（newSurveyData）vs 征收记录 data 的差异
      // 仅比较“调查侧存在的字段”（避免把征收特有字段比如协议编号 也当成差异）
      const surveyKeys = Object.keys(newSurveyData || {})
      const levyWindow: Record<string, any> = {}
      for (const k of surveyKeys) levyWindow[k] = levyData[k]
      const fieldDiffs: FieldDiffMap = {}
      const rawDiff = deepDiff(levyWindow, newSurveyData || {})
      // 过滤掉 LEVY_RELATION 字段本身（就是 surveyRecordId 引用）
      for (const k of Object.keys(rawDiff)) {
        if (k === lf.fieldName) continue
        fieldDiffs[k] = rawDiff[k]
      }

      if (diffSize(fieldDiffs) === 0) continue // 没差异就不创建请求

      let mode = lf.config.syncMode
      // 直接同步模式：立刻把差异合并到 levy record，并创建 APPROVED 请求
      if (mode === 'DIRECT') {
        const merged = applyFieldDiffs(levyData, fieldDiffs)
        await prisma.dataRecord.update({
          where: { id: levyRec.id },
          data: { data: merged as any, updatedBy: changedBy ?? null },
        })
        const syncReq = await prisma.dataSyncRequest.create({
          data: {
            source: 'SURVEY' as SyncSource,
            requestedBy: changedBy ?? null,
            surveyTableId,
            surveyRecordId,
            levyTableId: lf.levyTableId,
            levyRecordId: levyRec.id,
            relationFieldId: lf.fieldId,
            snapshotId: snapshot.id,
            fieldDiffs: fieldDiffs as any,
            status: 'APPROVED' as SyncRequestStatus,
            reviewedBy: changedBy ?? null,
            reviewedAt: new Date(),
            reviewComment: '[DIRECT] 自动同步（无审批）',
          },
        })
        syncRequestIds.push(syncReq.id)
        // 也写一条 OperationLog
        await prisma.operationLog.create({
          data: {
            userId: changedBy ?? null,
            action: 'SYNC_APPLY_DIRECT',
            module: 'SYNC',
            tableId: lf.levyTableId,
            recordId: levyRec.id,
            snapshotId: snapshot.id,
            syncRequestId: syncReq.id,
            detail: { fieldDiffs } as any,
            ipAddress: ipAddress ?? undefined,
            userAgent: userAgent ?? undefined,
          },
        })
        continue
      }

      // ===== SNAPSHOT_APPROVAL 模式（默认） =====
      // 把征收记录状态置为 SYNC_PENDING
      if (levyRec.status !== 'SYNC_PENDING') {
        try {
          await prisma.dataRecord.update({
            where: { id: levyRec.id },
            data: { status: 'SYNC_PENDING', updatedBy: changedBy ?? null },
          })
        } catch (e) { /* ignore enum transition race */ }
      }

      const syncReq = await prisma.dataSyncRequest.create({
        data: {
          source: 'SURVEY' as SyncSource,
          requestedBy: changedBy ?? null,
          surveyTableId,
          surveyRecordId,
          levyTableId: lf.levyTableId,
          levyRecordId: levyRec.id,
          relationFieldId: lf.fieldId,
          snapshotId: snapshot.id,
          fieldDiffs: fieldDiffs as any,
          status: 'PENDING' as SyncRequestStatus,
        },
      })
      syncRequestIds.push(syncReq.id)

      // 记录 OperationLog（便于审计中心第 3 标签直接反查）
      await prisma.operationLog.create({
        data: {
          userId: changedBy ?? null,
          action: 'SYNC_REQUEST_CREATED',
          module: 'SYNC',
          tableId: lf.levyTableId,
          recordId: levyRec.id,
          snapshotId: snapshot.id,
          syncRequestId: syncReq.id,
          detail: { fieldDiffs } as any,
          ipAddress: ipAddress ?? undefined,
          userAgent: userAgent ?? undefined,
        },
      })
    }
  }

  return { snapshotId: snapshot.id, syncRequestIds }
}

/**
 * 审批通过后应用同步：
 *   - 把 fieldDiffs 的 after 合并到目标 levyRecord.data
 *   - 若征收记录 status 是 SYNC_PENDING，改回原 CHANGED / REVIEWED / DRAFT
 *     （这里统一改成 REVIEWED，含义：征收记录最终数据已与调查对齐，可盖章签署）
 *   - 写 SYNC_APPLY 快照（落在 levy table 上，便于审计中心看 levy 侧变更）
 *   - 更新 DataSyncRequest 状态 = APPROVED
 */
export async function applyApprovedSyncRequest(params: {
  syncRequestId: number
  reviewedBy: number
  reviewComment?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<{ ok: boolean; error?: string; syncRequest?: DataSyncRequest }> {
  try {
    const req = await prisma.dataSyncRequest.findUnique({
      where: { id: params.syncRequestId },
    })
    if (!req) return { ok: false, error: '同步请求不存在' }
    if (req.status !== 'PENDING') return { ok: false, error: '同步请求状态不是待审核' }

    const fieldDiffs = (req.fieldDiffs as FieldDiffMap) || {}
    const currentLevy = await prisma.dataRecord.findUnique({
      where: { id: req.levyRecordId },
      select: { id: true, data: true, status: true, tableId: true },
    })
    if (!currentLevy) return { ok: false, error: '关联的征收记录不存在' }
    const levyData = (currentLevy.data as Record<string, any>) || {}
    const merged = applyFieldDiffs(levyData, fieldDiffs)

    // 落 levy 侧的“应用同步”快照（审计中心用于查看 levy 记录前后变化）
    const applySnapshot = await createRecordSnapshot({
      tableId: currentLevy.tableId,
      recordId: currentLevy.id,
      beforeData: levyData,
      afterData: merged,
      changedBy: params.reviewedBy,
      changeType: 'SYNC_APPLY',
      metadata: { ipAddress: params.ipAddress, userAgent: params.userAgent, fromSyncRequestId: req.id },
    })

    // 更新征收记录 data + 状态
    await prisma.dataRecord.update({
      where: { id: currentLevy.id },
      data: {
        data: merged as any,
        status: 'REVIEWED',
        updatedBy: params.reviewedBy,
      },
    })

    const updated = await prisma.dataSyncRequest.update({
      where: { id: req.id },
      data: {
        status: 'APPROVED',
        reviewedBy: params.reviewedBy,
        reviewedAt: new Date(),
        reviewComment: params.reviewComment ?? null,
      },
    })

    // 审计中心同步记录 OperationLog
    await prisma.operationLog.create({
      data: {
        userId: params.reviewedBy,
        action: 'SYNC_APPLY_APPROVED',
        module: 'SYNC',
        tableId: currentLevy.tableId,
        recordId: currentLevy.id,
        snapshotId: applySnapshot.id,
        syncRequestId: req.id,
        detail: { fieldDiffs } as any,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    })

    return { ok: true, syncRequest: updated }
  } catch (e: any) {
    console.error('[applyApprovedSyncRequest] failed:', e)
    return { ok: false, error: e?.message || '审核失败' }
  }
}

/**
 * 审核拒绝：把请求状态改成 REJECTED，不写快照不碰数据，只写 OperationLog
 */
export async function rejectSyncRequest(params: {
  syncRequestId: number
  reviewedBy: number
  reviewComment?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<{ ok: boolean; error?: string; syncRequest?: DataSyncRequest }> {
  try {
    const req = await prisma.dataSyncRequest.findUnique({
      where: { id: params.syncRequestId },
    })
    if (!req) return { ok: false, error: '同步请求不存在' }
    if (req.status !== 'PENDING') return { ok: false, error: '同步请求状态不是待审核' }

    // 检查这条 levy 记录是否还有其他 PENDING 请求，没有就把 SYNC_PENDING 改回 REVIEWED
    const otherPending = await prisma.dataSyncRequest.count({
      where: {
        levyRecordId: req.levyRecordId,
        status: 'PENDING',
        id: { not: req.id },
      },
    })
    if (otherPending === 0) {
      const cur = await prisma.dataRecord.findUnique({
        where: { id: req.levyRecordId },
        select: { status: true },
      })
      if (cur?.status === 'SYNC_PENDING') {
        await prisma.dataRecord.update({
          where: { id: req.levyRecordId },
          data: { status: 'REVIEWED', updatedBy: params.reviewedBy },
        })
      }
    }

    const updated = await prisma.dataSyncRequest.update({
      where: { id: req.id },
      data: {
        status: 'REJECTED',
        reviewedBy: params.reviewedBy,
        reviewedAt: new Date(),
        reviewComment: params.reviewComment ?? null,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: params.reviewedBy,
        action: 'SYNC_APPLY_REJECTED',
        module: 'SYNC',
        tableId: req.levyTableId,
        recordId: req.levyRecordId,
        syncRequestId: req.id,
        detail: { reason: params.reviewComment || '' } as any,
        ipAddress: params.ipAddress ?? undefined,
        userAgent: params.userAgent ?? undefined,
      },
    })

    return { ok: true, syncRequest: updated }
  } catch (e: any) {
    console.error('[rejectSyncRequest] failed:', e)
    return { ok: false, error: e?.message || '拒绝失败' }
  }
}
