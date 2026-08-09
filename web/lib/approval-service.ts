/**
 * 审批业务服务层
 *
 * 从 approval-v2-handlers.ts 中提取的业务逻辑，使用新引擎（engine/）。
 * API route 只做 HTTP 层（解析参数/返回响应），业务逻辑在此处理。
 */
import { prisma } from '@/lib/prisma'
import {
  startWorkflow,
  applyAction,
  revokeInstance,
  scanTimeout,
  deepParse,
} from '@/lib/engine'
import { createRecordSnapshot } from '@/lib/snapshot-utils'

// ─── 工具 ──────────────────────────────────────────────────────

export { deepParse }

/**
 * 根据表 + 触发事件匹配 v2 流程
 * 若传了 recordData，会按每个 workflow 的 triggerCondition 做"按条件选审批类型"：
 *   - 先看所有 ACTIVE/PUBLISHED 流程中 triggerCondition 满足的，优先返回条件最"具体"的（表达式数最多）
 *   - 没找到看表级绑定的 workflowId（若绑定的也有 triggerCondition 也校验）
 *   - 最后 fallback 到 isDefault=true 的流程（triggerCondition 为空或满足）
 */
export async function matchWorkflowForTrigger(
  tableId: number,
  triggerEvent: 'MANUAL_SUBMIT' | 'LEVY_SAVE' | 'LEVY_SYNC_PASS' | 'DATA_BATCH_IMPORT',
  opts?: { tx?: any; strict?: boolean; recordId?: number; recordData?: Record<string, any> },
): Promise<{ workflowId: number; workflowVersion: number } | null> {
  const tx = opts?.tx ?? prisma

  // 取记录数据（用于评估启动条件）
  let recordData: Record<string, any> = opts?.recordData ?? {}
  if (!recordData && opts?.recordId) {
    const rec = await tx.dataRecord.findUnique({
      where: { id: Number(opts.recordId) },
      select: { data: true },
    })
    if (rec) recordData = deepParse(rec.data) ?? {}
  }

  // 懒加载条件评估器（避免循环依赖）
  const { evaluateConditionConfig } = await import('@/lib/engine/condition-evaluator')

  const table = await tx.dataTable.findUnique({
    where: { id: tableId },
    select: { approvalTriggerConfig: true, featureFlags: true },
  })
  if (!table) return null

  const cfg = deepParse<any>(table.approvalTriggerConfig) ?? {}
  const binding = cfg[triggerEvent]

  // 1) 拉取该表所有 ACTIVE/PUBLISHED 且有 jsonDefinition 的流程，按条件评分选最优
  const allCandidates = await tx.approvalWorkflow.findMany({
    where: {
      tableId,
      status: { in: ['ACTIVE', 'PUBLISHED'] },
      AND: [{ NOT: { jsonDefinition: null } }],
    },
    select: {
      id: true, version: true, isDefault: true,
      triggerCondition: true,
    },
    orderBy: { version: 'desc' },
  })

  if (allCandidates.length > 0) {
    // 评估每个候选：triggerCondition 为空 = 通用匹配（score=0）；有条件且满足 = score=条件数；不满足 = 丢弃
    const scored = allCandidates
      .map((wf: { id: number; version: number; isDefault: boolean; triggerCondition: any }) => {
        const tc = (wf.triggerCondition ?? null) as any
        // triggerCondition 支持数组简洁写法或完整 ConditionConfig
        let conditionCfg: any = null
        if (Array.isArray(tc)) {
          conditionCfg = { expressions: tc }
        } else if (tc && typeof tc === 'object' && (Array.isArray(tc.expressions) || Array.isArray(tc.orExpressions))) {
          conditionCfg = tc
        }
        const ok = evaluateConditionConfig(conditionCfg, recordData)
        if (!ok) return null
        const specificity =
          conditionCfg && Array.isArray(conditionCfg.expressions)
            ? conditionCfg.expressions.length + (conditionCfg.orExpressions?.length ?? 0)
            : 0
        // 若流程就是绑定流程，再加权重 1000，优先使用用户显式绑定的
        const isBound = binding?.enabled && Number(binding?.workflowId) === wf.id ? 1000 : 0
        return {
          wf,
          score: specificity + isBound,
        }
      })
      .filter((x: any): x is { wf: any; score: number } => x != null)
      .sort((a: any, b: any) => {
        if (b.score !== a.score) return b.score - a.score
        // 同分：isDefault 优先，然后 version 大优先
        if (b.wf.isDefault !== a.wf.isDefault) return (b.wf.isDefault ? 1 : 0) - (a.wf.isDefault ? 1 : 0)
        return b.wf.version - a.wf.version
      })

    if (scored[0]) return { workflowId: scored[0].wf.id, workflowVersion: scored[0].wf.version }
  }

  // 2) 旧的兼容：表级 binding 明确指向的工作流（即使没走上面，兜底也直接用绑定 ID）
  if (binding && binding.enabled && Number.isFinite(binding.workflowId)) {
    const wf = await tx.approvalWorkflow.findUnique({
      where: { id: binding.workflowId },
      select: { id: true, version: true, status: true, isDefault: true, jsonDefinition: true, triggerCondition: true },
    })
    if (wf && wf.jsonDefinition && (wf.status === 'ACTIVE' || wf.status === 'PUBLISHED')) {
      // 有 triggerCondition 时检查是否满足，不满足则不用
      const tc = wf.triggerCondition as any
      if (tc) {
        const conditionCfg = Array.isArray(tc) ? { expressions: tc } : tc
        if (!evaluateConditionConfig(conditionCfg, recordData)) return null
      }
      return { workflowId: wf.id, workflowVersion: binding.workflowVersion ?? wf.version }
    }
  }

  if (opts?.strict) return null

  // 3) fallback: 同表 isDefault=true + status=ACTIVE/PUBLISHED + jsonDefinition!=null 的最高 version
  const candidates = await tx.approvalWorkflow.findMany({
    where: {
      tableId,
      status: { in: ['ACTIVE', 'PUBLISHED'] },
      isDefault: true,
      AND: [{ NOT: { jsonDefinition: null } }],
    },
    orderBy: { version: 'desc' },
    take: 1,
    select: { id: true, version: true },
  })
  return candidates[0]
    ? { workflowId: candidates[0].id, workflowVersion: candidates[0].version }
    : null
}

// ─── 发起审批 ──────────────────────────────────────────────────

export async function startInstance(params: {
  tableId: number
  recordId: number
  initiatorId: number
  triggerEvent: string
  workflowIdOverride?: number | null
  workflowVersionOverride?: number
  expectUpdatedAt?: string | null
  snapshotDataAfter?: any
  ip?: string | null
  ua?: string | null
}): Promise<{
  ok: boolean
  error?: string
  message?: string
  status?: number
  data?: any
}> {
  const record = await prisma.dataRecord.findUnique({
    where: { id: params.recordId },
    include: { table: true },
  })
  if (!record) return { ok: false, error: '记录不存在', status: 404 }
  if (record.tableId !== params.tableId) return { ok: false, error: 'tableId 不匹配', status: 400 }

  // 乐观锁
  const optimisticLock = params.expectUpdatedAt
    ? new Date(params.expectUpdatedAt)
    : record.updatedAt ?? new Date()
  if (params.expectUpdatedAt) {
    const latest = await prisma.dataRecord.findUnique({
      where: { id: params.recordId },
      select: { updatedAt: true },
    })
    if (latest && Number(latest.updatedAt) !== Number(optimisticLock)) {
      return {
        ok: false, error: 'OPTIMISTIC_LOCK_FAIL',
        message: '记录已被他人更新，请刷新后再提交', status: 409,
      }
    }
  }

  // 匹配流程（把 recordId/recordData 传进去用于按条件选审批类型）
  const matched = params.workflowIdOverride
    ? { workflowId: params.workflowIdOverride, workflowVersion: params.workflowVersionOverride ?? 1 }
    : await matchWorkflowForTrigger(params.tableId, params.triggerEvent as any, {
        recordId: params.recordId,
        recordData: params.snapshotDataAfter ?? undefined,
      })
  if (!matched) {
    return { ok: false, error: '该表/触发事件未绑定 v2 审批流程', status: 409 }
  }

  const before: any = deepParse(record.data) ?? {}
  const afterSnapshot = params.snapshotDataAfter ?? null

  // 快照 + 审计
  const snapshot = await createRecordSnapshot({
    tableId: params.tableId,
    recordId: params.recordId,
    beforeData: before,
    afterData: afterSnapshot ?? before,
    changedBy: params.initiatorId,
    changeType: 'UPDATE',
    metadata: {
      triggerEvent: params.triggerEvent,
      initiatorId: params.initiatorId,
      workflowId: matched.workflowId,
      workflowVersion: matched.workflowVersion,
      kind: 'APPROVAL_START',
    },
  })

  const res = await startWorkflow({
    workflowId: matched.workflowId,
    tableId: params.tableId,
    recordId: params.recordId,
    initiatorId: params.initiatorId,
    triggerEvent: params.triggerEvent,
    recordDataBefore: before,
    recordDataAfter: afterSnapshot,
    optimisticLock: record.updatedAt ?? new Date(),
    ip: params.ip,
    ua: params.ua,
  })
  if (!res) return { ok: false, error: '创建审批实例失败', status: 500 }

  // 审计日志
  try {
    await prisma.operationLog.create({
      data: {
        userId: params.initiatorId,
        action: 'APPROVAL_V2.START',
        module: 'APPROVAL_V2',
        tableId: params.tableId,
        recordId: params.recordId,
        snapshotId: snapshot.id,
        approvalInstanceId: res.instanceId,
        detail: {
          workflowId: matched.workflowId,
          workflowVersion: matched.workflowVersion,
          triggerEvent: params.triggerEvent,
          snapshotId: snapshot.id,
          instanceId: res.instanceId,
        } as any,
        ipAddress: params.ip ?? undefined,
        userAgent: params.ua ?? undefined,
      },
    })
  } catch (_) { /* audit must not block primary flow */ }

  return {
    ok: true,
    data: {
      instanceId: res.instanceId,
      initialAssignees: res.initialAssignees,
      ccUserIds: res.ccUserIds,
    },
  }
}

// ─── 审批动作 ──────────────────────────────────────────────────

export async function executeNodeAction(params: {
  nodeInstanceId: number
  assigneeId: number
  action: 'APPROVE' | 'REJECT' | 'TRANSFER' | 'ADD_COUNTERSIGN'
  comment?: string | null
  transferredTo?: number | null
  addCountersignIds?: number[]
  gotoNodeKey?: string | null
  restart?: boolean
  restartWithWorkflowId?: number | null
  ip?: string | null
  ua?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string; status?: number; data?: any }> {
  // 校验待办
  const ni = await prisma.approvalNodeInstance.findUnique({
    where: { id: params.nodeInstanceId },
    include: { instance: true, node: true },
  })
  if (!ni) return { ok: false, error: '待办不存在', status: 404 }
  if (ni.status !== 'PENDING') return { ok: false, error: '待办状态非 PENDING', status: 409 }

  if (params.action === 'TRANSFER' && !params.transferredTo) {
    return { ok: false, error: '转签需要 transferredTo', status: 400 }
  }
  if (params.action === 'ADD_COUNTERSIGN' && !params.addCountersignIds?.length) {
    return { ok: false, error: '加签需要 addCountersignIds', status: 400 }
  }

  // 乐观锁
  if (ni.instance.optimisticLock) {
    const rec = await prisma.dataRecord.findUnique({
      where: { id: ni.instance.recordId },
      select: { updatedAt: true },
    })
    if (rec && Number(rec.updatedAt) !== Number(ni.instance.optimisticLock)) {
      return {
        ok: false, error: 'OPTIMISTIC_LOCK_FAIL',
        message: '记录在审批中已被外部更新，请确认后重新发起审批', status: 409,
      }
    }
  }

  // 加签
  if (params.action === 'ADD_COUNTERSIGN') {
    let addResult: any
    await prisma.$transaction(async tx => {
      addResult = await applyAction({
        nodeInstanceId: params.nodeInstanceId,
        assigneeId: params.assigneeId,
        action: 'APPROVE',
        comment: params.comment ?? '（加签附议：未表态，添加审批人）',
        addCountersignIds: params.addCountersignIds,
        ip: params.ip,
        ua: params.ua,
        tx: tx as any,
      })
    })
    return { ok: true, data: addResult }
  }

  // 驳回 + 重新发起
  if (params.action === 'REJECT' && params.restart) {
    let restartedInstanceId: number | undefined
    const workflowOverride = params.restartWithWorkflowId ?? ni.instance.workflowId

    const res = await applyAction({
      nodeInstanceId: params.nodeInstanceId,
      assigneeId: params.assigneeId,
      action: 'REJECT',
      comment: params.comment ?? null,
      gotoNodeKey: params.gotoNodeKey ?? null,
      ip: params.ip,
      ua: params.ua,
    })

    // 如果原实例标记为 RESTARTED，创建新实例
    const refreshed = await prisma.approvalInstance.findUnique({
      where: { id: ni.instanceId },
      select: { status: true },
    })
    if (refreshed?.status === 'RESTARTED') {
      const record = await prisma.dataRecord.findUnique({ where: { id: ni.instance.recordId } })
      if (record) {
        const before: any = deepParse(record.data) ?? {}
        const ni_ = await startWorkflow({
          workflowId: workflowOverride,
          tableId: ni.instance.tableId,
          recordId: ni.instance.recordId,
          initiatorId: ni.instance.initiatorId ?? params.assigneeId,
          triggerEvent: ni.instance.triggerEvent ?? 'MANUAL_SUBMIT',
          recordDataBefore: before,
          parentInstanceId: ni.instance.id,
          optimisticLock: record.updatedAt ?? new Date(),
        })
        restartedInstanceId = ni_?.instanceId
      }
    }
    return { ok: true, data: { ...res, restartedInstanceId } }
  }

  // 普通审批动作
  const engineAction: any = params.action === 'TRANSFER' ? 'TRANSFER' : params.action
  const res = await applyAction({
    nodeInstanceId: params.nodeInstanceId,
    assigneeId: params.assigneeId,
    action: engineAction,
    comment: params.comment ?? null,
    transferredTo: params.transferredTo ?? null,
    transferredFrom: params.action === 'TRANSFER' ? params.assigneeId : undefined,
    gotoNodeKey: params.gotoNodeKey ?? null,
    ip: params.ip,
    ua: params.ua,
  })

  // 审批通过 → 回写 record.data
  if (res.instanceStatus === 'APPROVED') {
    await prisma.$transaction(async tx => {
      const inst = await tx.approvalInstance.findUnique({ where: { id: ni.instanceId } })
      if (!inst) return
      if (inst.optimisticLock) {
        const rec = await tx.dataRecord.findUnique({
          where: { id: inst.recordId },
          select: { updatedAt: true },
        })
        if (rec && Number(rec.updatedAt) !== Number(inst.optimisticLock)) {
          throw new Error('OPTIMISTIC_LOCK_FAIL: 审批通过落库时发现记录已被外部修改（请重新发起）')
        }
      }
      const after = deepParse<any>(inst.snapshotDataAfter)
      if (after) {
        await tx.dataRecord.update({
          where: { id: inst.recordId },
          data: { data: JSON.stringify(after) as any, status: 'REVIEWED' as any, updatedBy: params.assigneeId },
        })
      } else {
        await tx.dataRecord.update({
          where: { id: inst.recordId },
          data: { status: 'REVIEWED' as any, updatedBy: params.assigneeId },
        })
      }
    })
  }

  // 审计日志
  try {
    await prisma.operationLog.create({
      data: {
        userId: params.assigneeId,
        action: `APPROVAL_V2.NODE_${params.action}`,
        module: 'APPROVAL_V2',
        tableId: ni.instance.tableId,
        recordId: ni.instance.recordId,
        approvalInstanceId: ni.instanceId,
        detail: {
          nodeInstanceId: params.nodeInstanceId,
          nodeId: ni.nodeId,
          action: params.action,
          comment: params.comment ?? null,
          transferredTo: params.transferredTo ?? null,
          addCountersignIds: params.addCountersignIds ?? null,
          gotoNodeKey: params.gotoNodeKey ?? null,
          restart: params.restart ?? false,
          result: res,
        } as any,
        ipAddress: params.ip ?? undefined,
        userAgent: params.ua ?? undefined,
      },
    })
  } catch (_) { /* audit must not block */ }

  return { ok: true, data: res }
}

// ─── 撤回 ──────────────────────────────────────────────────────

export async function revokeInstanceService(
  instanceId: number,
  revokerId: number,
  reason?: string | null,
  ip?: string | null,
  ua?: string | null,
) {
  return revokeInstance(instanceId, revokerId, reason ?? undefined, ip, ua)
}

// ─── 超时扫描 ──────────────────────────────────────────────────

export async function timeoutScanService(limit = 500) {
  return scanTimeout(limit)
}

// ─── 征收自动触发 ──────────────────────────────────────────────

export async function tryLevySaveAutoTrigger(params: {
  table: { id: number; categoryId: number | null; approvalTriggerConfig?: any; featureFlags?: any }
  recordId: number
  initiatorId: number
  ip: string | null
  ua: string | null
}) {
  try {
    const cat = await prisma.tableCategory.findUnique({
      where: { id: params.table.categoryId ?? 0 },
      select: { module: true },
    }).catch(() => null)
    if (!cat || cat.module !== 'LEVY') return { skipped: true, reason: '非征收模块' }

    // 若有进行中的审批实例，跳过
    const running = await prisma.approvalInstance.findFirst({
      where: {
        tableId: params.table.id,
        recordId: params.recordId,
        status: { in: ['PENDING'] },
      },
      select: { id: true, status: true },
    })
    if (running) return { skipped: true, reason: '已有进行中的审批实例', running }

    const matched = await matchWorkflowForTrigger(params.table.id, 'LEVY_SAVE', { recordId: params.recordId })
    if (!matched) return { skipped: true, reason: 'LEVY_SAVE 未绑定流程' }

    const record = await prisma.dataRecord.findUnique({ where: { id: params.recordId } })
    if (!record) return { skipped: true, reason: '记录不存在' }

    const dataBefore = deepParse<any>(record.data) ?? {}
    const snapshot = await createRecordSnapshot({
      tableId: params.table.id,
      recordId: params.recordId,
      beforeData: dataBefore,
      afterData: dataBefore,
      changedBy: params.initiatorId,
      changeType: 'UPDATE',
      metadata: { workflowId: matched.workflowId, kind: 'LEVY_SAVE_AUTO_TRIGGER' },
    })

    const inst = await startWorkflow({
      workflowId: matched.workflowId,
      tableId: params.table.id,
      recordId: params.recordId,
      initiatorId: params.initiatorId,
      triggerEvent: 'LEVY_SAVE',
      recordDataBefore: dataBefore,
      optimisticLock: record.updatedAt ?? new Date(),
      ip: params.ip,
      ua: params.ua,
    })
    if (!inst) return { skipped: false, ok: false, error: '发起失败' }

    try {
      await prisma.operationLog.create({
        data: {
          userId: params.initiatorId,
          action: 'APPROVAL_V2.LEVY_SAVE_AUTO_TRIGGER',
          module: 'APPROVAL_V2',
          tableId: params.table.id,
          recordId: params.recordId,
          snapshotId: snapshot.id,
          approvalInstanceId: inst.instanceId,
          detail: { snapshotId: snapshot.id, instanceId: inst.instanceId, matched } as any,
          ipAddress: params.ip ?? undefined,
          userAgent: params.ua ?? undefined,
        },
      })
    } catch (_) { /* */ }

    return { skipped: false, ok: true, instanceId: inst.instanceId, matched }
  } catch (e: any) {
    return { skipped: false, ok: false, error: e.message ?? '自动发起审批失败' }
  }
}
