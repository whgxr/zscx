/**
 * 审批核心引擎 — DAG 推进 + 审批动作
 *
 * 统一从 jsonDefinition（WorkflowNodeDef[]）读取节点配置，
 * 不再依赖 ApprovalNode DB 字段中的 approverKind/approverCandidates 等。
 *
 * 覆盖：
 *  - startWorkflow: 创建实例 + BFS 推进到首个阻塞节点
 *  - applyAction:   处理单条 NodeInstance 的审批动作
 *  - revokeInstance: 发起人撤回
 *  - scanTimeout:   超时扫描（cron）
 */
import type { Prisma, ApprovalWorkflow, ApprovalNode, DataRecord } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  parseDefinition, nodeById, startKey, isApproverType, deepParse,
  type WorkflowDefinition, type WorkflowNodeDef,
  type StartInstanceOpts, type StartResult, type ApplyActionOpts, type ActionResult,
} from './types'
import { evaluateNodeCondition } from './condition-evaluator'
import { resolveApproverUserIds, resolveCcUserIds, type ResolverContext } from './approver-resolver'

// ═══════════════════════════════════════════════════════════════
//  工具
// ═══════════════════════════════════════════════════════════════

type Tx = Prisma.TransactionClient

type AdvCtx = {
  initiatorId: number | null
  lastApproverId: number | null
}

async function appendChain(tx: Tx, instanceId: number, entry: any): Promise<void> {
  const cur = await tx.approvalInstance.findUnique({ where: { id: instanceId }, select: { approvalChain: true } })
  if (!cur) return
  const arr: any[] = deepParse<any[]>(cur.approvalChain) ?? []
  arr.push(entry)
  await tx.approvalInstance.update({ where: { id: instanceId }, data: { approvalChain: JSON.stringify(arr) as any } })
}

function calcDueAt(nodeDef: WorkflowNodeDef, wf: ApprovalWorkflow): Date | undefined {
  const nodeHours = nodeDef.timeout?.hours
  const policy: any = deepParse(wf.timeoutPolicy) ?? {}
  const hours = nodeHours ?? policy.defaultHours ?? null
  if (!hours) return undefined
  const d = new Date()
  d.setTime(d.getTime() + hours * 3_600_000)
  return d
}

/** BFS 反向查找上一个 APPROVER 节点（用于 GOTO_PREVIOUS 驳回策略） */
function findPrevApproverKey(def: WorkflowDefinition, from: WorkflowNodeDef): string | null {
  const visited = new Set<string>()
  const q: string[] = [...(from.prev ?? [])]
  while (q.length) {
    const k = q.shift()!
    if (visited.has(k)) continue
    visited.add(k)
    const n = nodeById(def, k)
    if (!n) continue
    if (isApproverType(n.type) || n.type === 'START') return k
    for (const p of n.prev ?? []) if (!visited.has(p)) q.push(p)
  }
  return startKey(def) ?? null
}

// ═══════════════════════════════════════════════════════════════
//  BFS 推进（非阻塞节点直通，直到遇到 APPROVER 或 END）
// ═══════════════════════════════════════════════════════════════

type AdvanceInput = {
  tx: Tx
  workflow: ApprovalWorkflow
  dbNodes: ApprovalNode[]
  def: WorkflowDefinition
  instance: any           // ApprovalInstance row
  record: DataRecord
  fromKeys: string[]
  context: AdvCtx
  ip?: string | null
  ua?: string | null
  skipVisited?: Set<string>
}

type AdvanceOutput = {
  assignees: { nodeId: number; nodeKey: string | null; assigneeIds: number[] }[]
  ccTargets: number[]
  reachedEnd: boolean
}

async function advance(inp: AdvanceInput): Promise<AdvanceOutput> {
  const { tx, workflow, dbNodes, def, instance, record, context, ip, ua } = inp
  const recordData: Record<string, any> = deepParse(record.data) ?? {}
  const assigneesOut: AdvanceOutput['assignees'] = []
  const ccOut: number[] = []
  const visited = new Set(inp.skipVisited ?? [])
  const queue: string[] = [...inp.fromKeys]

  while (queue.length) {
    const curKey = queue.shift()!
    if (visited.has(curKey)) continue
    visited.add(curKey)

    const jnode = nodeById(def, curKey)
    if (!jnode) continue
    const dbNode = dbNodes.find(n => n.nodeKey === curKey)

    switch (jnode.type) {
      // ── START → 直接进入后继 ──
      case 'START': {
        for (const nx of jnode.next ?? []) if (!visited.has(nx)) queue.push(nx)
        break
      }

      // ── END → 流程结束 ──
      case 'END':
        return { assignees: assigneesOut, ccTargets: ccOut, reachedEnd: true }

      // ── 条件分支 → 求值后走 TRUE/FALSE 路径 ──
      case 'CONDITION_BRANCH': {
        const ok = evaluateNodeCondition(jnode, recordData)
        const nexts = ok ? (jnode.nextTrue ?? []) : (jnode.nextFalse ?? [])
        for (const nx of nexts) if (!visited.has(nx)) queue.push(nx)
        break
      }

      // ── CC → 抄送 + 继续推进 ──
      case 'CC': {
        if (dbNode) {
          const rctx: ResolverContext = { record, initiatorId: context.initiatorId, lastApproverId: context.lastApproverId }
          const ccIds = await resolveCcUserIds(tx, jnode.ccTargets, rctx)
          ccOut.push(...ccIds)
          // 合并到 instance.ccList
          const ccList: number[] = deepParse<any[]>(instance.ccList) ?? []
          const merged = Array.from(new Set([...ccList, ...ccIds]))
          await tx.approvalInstance.update({
            where: { id: instance.id },
            data: { ccList: JSON.stringify(merged) as any },
          })
        }
        for (const nx of jnode.next ?? []) if (!visited.has(nx)) queue.push(nx)
        break
      }

      // ── PARALLEL → 合流判定 ──
      case 'PARALLEL': {
        const prevs = jnode.prev ?? []
        const waitAll = (jnode.parallelWaitMode ?? 'ALL') === 'ALL'
        const reached = waitAll
          ? prevs.every(p => visited.has(p))
          : prevs.some(p => visited.has(p))
        if (!reached) break // 合流未完成，停止
        for (const nx of jnode.next ?? []) if (!visited.has(nx)) queue.push(nx)
        break
      }

      // ── APPROVER_SINGLE / COUNTERSIGN / ORSIGN → 阻塞节点 ──
      default: {
        if (!isApproverType(jnode.type)) {
          // 未知类型，跳过后继
          for (const nx of jnode.next ?? []) if (!visited.has(nx)) queue.push(nx)
          break
        }
        if (!dbNode) {
          // 无 DB 注册记录，直接跳过
          for (const nx of jnode.next ?? []) if (!visited.has(nx)) queue.push(nx)
          break
        }

        const rctx: ResolverContext = { record, initiatorId: context.initiatorId, lastApproverId: context.lastApproverId }
        const assigneeIds = await resolveApproverUserIds(tx, jnode, rctx)

        // 空审批人 → 自动通过
        if (assigneeIds.length === 0) {
          await tx.approvalNodeInstance.create({
            data: {
              instanceId: instance.id, nodeId: dbNode.id, assigneeId: null,
              status: 'APPROVED' as any, action: 'APPROVE' as any,
              comment: '自动通过（无审批人配置）', processedAt: new Date(),
              actionDetail: JSON.stringify({ auto: true, reason: 'NO_ASSIGNEES' }) as any,
              prevInstanceIds: JSON.stringify([]) as any,
              ipAddress: ip ?? undefined, userAgent: ua ?? undefined,
            },
          })
          await appendChain(tx, instance.id, {
            nodeId: dbNode.id, nodeKey: dbNode.nodeKey,
            assigneeId: null, action: 'AUTO_PASS', at: new Date().toISOString(), comment: '无审批人配置',
          })
          for (const nx of jnode.next ?? []) if (!visited.has(nx)) queue.push(nx)
          break
        }

        // 创建 NodeInstance（每人一条）
        const isCountersign = jnode.type === 'APPROVER_COUNTERSIGN'
        const total = assigneeIds.length
        const dueAt = calcDueAt(jnode, workflow)

        for (const aid of assigneeIds) {
          await tx.approvalNodeInstance.create({
            data: {
              instanceId: instance.id, nodeId: dbNode.id, assigneeId: aid,
              status: 'PENDING' as any,
              countersignTotal: isCountersign ? total : undefined,
              countersignApprovedCount: 0,
              dueAt,
              ipAddress: ip ?? undefined, userAgent: ua ?? undefined,
              prevInstanceIds: JSON.stringify([]) as any,
            },
          })
        }
        // currentNodeId 标记首个 APPROVER 节点
        if (!instance.currentNodeId) {
          await tx.approvalInstance.update({ where: { id: instance.id }, data: { currentNodeId: dbNode.id } })
        }
        assigneesOut.push({ nodeId: dbNode.id, nodeKey: dbNode.nodeKey, assigneeIds })
        // 审批节点阻塞 → 不再继续 BFS
        break
      }
    }
  }

  return { assignees: assigneesOut, ccTargets: ccOut, reachedEnd: false }
}

// ═══════════════════════════════════════════════════════════════
//  启动审批实例
// ═══════════════════════════════════════════════════════════════

export async function startWorkflow(opts: StartInstanceOpts): Promise<StartResult | null> {
  type RunOutput = StartResult & { reachedEnd?: boolean }

  const run = async (tx: Tx): Promise<RunOutput | null> => {
    const workflow = await tx.approvalWorkflow.findUnique({
      where: { id: opts.workflowId },
      include: { nodes: true },
    })
    if (!workflow) return null

    const record = await tx.dataRecord.findUnique({ where: { id: opts.recordId } })
    if (!record) return null

    // 创建 ApprovalInstance
    const instance = await tx.approvalInstance.create({
      data: {
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        tableId: opts.tableId,
        recordId: opts.recordId,
        status: 'PENDING',
        triggerEvent: opts.triggerEvent,
        initiatorId: opts.initiatorId,
        snapshotDataBefore: opts.recordDataBefore ? JSON.stringify(opts.recordDataBefore) as any : null,
        snapshotDataAfter: opts.recordDataAfter ? JSON.stringify(opts.recordDataAfter) as any : null,
        optimisticLock: opts.optimisticLock ?? new Date(),
        parentInstanceId: opts.parentInstanceId ?? null,
        approvalChain: JSON.stringify([]) as any,
        ccList: JSON.stringify([]) as any,
      },
    })

    // 解析 jsonDefinition
    const def = parseDefinition(workflow)
    if (!def) return { instanceId: instance.id, initialAssignees: [], ccUserIds: [], record, workflow }

    const sk = startKey(def)
    if (!sk) return { instanceId: instance.id, initialAssignees: [], ccUserIds: [], record, workflow }

    // BFS 从 START 推进
    const adv = await advance({
      tx, workflow, dbNodes: workflow.nodes, def, instance, record,
      fromKeys: [sk],
      context: { initiatorId: opts.initiatorId, lastApproverId: null },
      ip: opts.ip, ua: opts.ua,
    })

    if (adv.reachedEnd) {
      await tx.approvalInstance.update({
        where: { id: instance.id },
        data: { status: 'APPROVED' as any, completedAt: new Date() },
      })
    }

    return {
      instanceId: instance.id,
      initialAssignees: adv.assignees,
      ccUserIds: adv.ccTargets,
      record, workflow,
    }
  }

  if (opts.tx) {
    return run(opts.tx as Tx)
  }
  return prisma.$transaction<RunOutput | null>(run as any, { maxWait: 60_000, timeout: 120_000 })
}

// ═══════════════════════════════════════════════════════════════
//  审批动作（单条 NodeInstance）
// ═══════════════════════════════════════════════════════════════

export async function applyAction(opts: ApplyActionOpts): Promise<ActionResult> {
  const run = async (tx: Tx): Promise<ActionResult> => {
    const ni = await tx.approvalNodeInstance.findUnique({
      where: { id: opts.nodeInstanceId },
      include: { instance: { include: { workflow: { include: { nodes: true } } } } },
    })
    if (!ni) throw new Error(`NodeInstance#${opts.nodeInstanceId} not found`)
    if (ni.status !== 'PENDING') {
      return { status: ni.status as string, finished: true, instanceStatus: ni.instance.status }
    }

    const inst = ni.instance
    const workflow = inst.workflow
    const def = parseDefinition(workflow)
    if (!def) throw new Error(`Workflow#${workflow.id} missing jsonDefinition`)

    const record = await tx.dataRecord.findUnique({ where: { id: inst.recordId } })
    if (!record) throw new Error(`Record#${inst.recordId} missing`)

    const dbNode = workflow.nodes.find(n => n.id === ni.nodeId)
    if (!dbNode) throw new Error('ApprovalNode missing')

    const jnode = nodeById(def, dbNode.nodeKey!)
    if (!jnode) throw new Error('WorkflowNodeDef missing')

    const now = new Date()

    // ── 1. 更新 NodeInstance 状态 ──
    const niStatus =
      opts.action === 'TIMEOUT_PASS' ? 'TIMEOUT_PASSED'
      : opts.action === 'TIMEOUT_REJECT' ? 'TIMEOUT_REJECTED'
      : opts.action === 'REJECT' ? 'REJECTED'
      : opts.action === 'TRANSFER' ? 'TRANSFERRED'
      : 'APPROVED'

    const actionDetail: any = {}
    if (opts.transferredTo) actionDetail.transferredTo = opts.transferredTo
    if (opts.transferredFrom) actionDetail.transferredFrom = opts.transferredFrom
    if (opts.addCountersignIds?.length) actionDetail.countersignAddedIds = opts.addCountersignIds
    if (opts.gotoNodeKey) actionDetail.gotoNodeKey = opts.gotoNodeKey

    await tx.approvalNodeInstance.update({
      where: { id: ni.id },
      data: {
        status: niStatus as any,
        action: opts.action as any,
        comment: opts.comment ?? undefined,
        transferredTo: opts.transferredTo ?? undefined,
        transferredFrom: opts.transferredFrom ?? undefined,
        processedAt: now,
        actualDurationSeconds: Math.max(1, Math.floor((now.getTime() - (ni.createdAt?.getTime() ?? now.getTime())) / 1000)),
        ipAddress: opts.ip ?? undefined,
        userAgent: opts.ua ?? undefined,
        actionDetail: Object.keys(actionDetail).length ? JSON.stringify(actionDetail) as any : undefined,
      },
    })

    // 追加 approvalChain
    await appendChain(tx, inst.id, {
      nodeId: dbNode.id, nodeKey: dbNode.nodeKey,
      assigneeId: opts.assigneeId, action: opts.action,
      at: now.toISOString(), comment: opts.comment ?? null, actionDetail,
    })

    // ── 2. 加签 ──
    if (opts.addCountersignIds?.length) {
      const existing = await tx.approvalNodeInstance.findMany({ where: { instanceId: inst.id, nodeId: dbNode.id } })
      const had = new Set(existing.map(a => a.assigneeId))
      const total = existing.length + opts.addCountersignIds.filter(id => !had.has(id)).length
      for (const id of opts.addCountersignIds) {
        if (had.has(id)) continue
        await tx.approvalNodeInstance.create({
          data: {
            instanceId: inst.id, nodeId: dbNode.id, assigneeId: id,
            status: 'PENDING' as any, countersignTotal: total, countersignApprovedCount: 0,
          },
        })
        had.add(id)
      }
      await tx.approvalNodeInstance.updateMany({
        where: { instanceId: inst.id, nodeId: dbNode.id },
        data: { countersignTotal: total },
      })
    }

    // ── 3. 转签 → 创建新 PENDING，不推进 ──
    if (opts.action === 'TRANSFER' && opts.transferredTo) {
      await tx.approvalNodeInstance.create({
        data: {
          instanceId: inst.id, nodeId: dbNode.id, assigneeId: opts.transferredTo,
          status: 'PENDING' as any,
          countersignTotal: ni.countersignTotal ?? undefined,
          countersignApprovedCount: ni.countersignApprovedCount ?? undefined,
          dueAt: ni.dueAt ?? undefined,
        },
      })
      return {
        status: 'TRANSFERRED', finished: false, instanceStatus: inst.status,
        nextNodeKeys: [],
        newAssignees: [{ nodeId: dbNode.id, nodeKey: dbNode.nodeKey, assigneeIds: [opts.transferredTo] }],
      }
    }

    // ── 4. REJECT → 按 onReject 策略 ──
    if (opts.action === 'REJECT' || opts.action === 'TIMEOUT_REJECT') {
      const strategy = jnode.onReject ?? 'REJECT_INSTANCE'

      if (strategy === 'REJECT_INSTANCE') {
        await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: 'REJECTED' as any, completedAt: now } })
        await tx.approvalNodeInstance.updateMany({
          where: { instanceId: inst.id, status: 'PENDING' as any },
          data: { status: 'CANCELLED' as any, processedAt: now },
        })
        return { status: 'REJECTED', finished: true, instanceStatus: 'REJECTED' }
      }

      if (strategy === 'GOTO_PREVIOUS' || strategy === 'GOTO_NODE') {
        const targetKey = strategy === 'GOTO_NODE'
          ? (opts.gotoNodeKey ?? null)
          : findPrevApproverKey(def, jnode)

        if (targetKey) {
          await tx.approvalNodeInstance.updateMany({
            where: { instanceId: inst.id, status: 'PENDING' as any },
            data: { status: 'CANCELLED' as any, processedAt: now },
          })
          const adv = await advance({
            tx, workflow, dbNodes: workflow.nodes, def, instance: inst, record,
            fromKeys: [targetKey],
            context: { initiatorId: inst.initiatorId, lastApproverId: opts.assigneeId },
            ip: opts.ip, ua: opts.ua,
          })
          if (adv.reachedEnd) {
            await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: 'APPROVED' as any, completedAt: now } })
          }
          return {
            status: 'REJECTED', finished: adv.reachedEnd,
            instanceStatus: adv.reachedEnd ? 'APPROVED' : inst.status,
            newAssignees: adv.assignees, ccTargets: adv.ccTargets,
          }
        }
        // 无目标 → 整单驳回
        await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: 'REJECTED' as any, completedAt: now } })
        await tx.approvalNodeInstance.updateMany({
          where: { instanceId: inst.id, status: 'PENDING' as any },
          data: { status: 'CANCELLED' as any, processedAt: now },
        })
        return { status: 'REJECTED', finished: true, instanceStatus: 'REJECTED' }
      }

      if (strategy === 'RESTART') {
        await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: 'RESTARTED' as any, completedAt: now } })
        await tx.approvalNodeInstance.updateMany({
          where: { instanceId: inst.id, status: 'PENDING' as any },
          data: { status: 'CANCELLED' as any, processedAt: now },
        })
        return { status: 'REJECTED', finished: true, instanceStatus: 'RESTARTED' }
      }
    }

    // ── 5. APPROVE / TIMEOUT_PASS → 会签/或签判定 + 推进 ──

    // 会签：统计 quorum
    if (jnode.type === 'APPROVER_COUNTERSIGN') {
      const all = await tx.approvalNodeInstance.findMany({ where: { instanceId: inst.id, nodeId: dbNode.id } })
      const total = all.length
      const approvedN = all.filter(a => a.status === 'APPROVED').length
      const rejectedN = all.filter(a => a.status === 'REJECTED' || a.status === 'TIMEOUT_REJECTED').length
      const pendingN = all.filter(a => a.status === 'PENDING').length

      await tx.approvalNodeInstance.updateMany({
        where: { instanceId: inst.id, nodeId: dbNode.id },
        data: { countersignTotal: total, countersignApprovedCount: approvedN },
      })

      // 有驳回且无 pending → 整节点失败
      if (rejectedN > 0 && pendingN === 0) {
        const strategy = jnode.onReject ?? 'REJECT_INSTANCE'
        if (strategy === 'REJECT_INSTANCE') {
          await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: 'REJECTED' as any, completedAt: now } })
          await tx.approvalNodeInstance.updateMany({
            where: { instanceId: inst.id, status: 'PENDING' as any },
            data: { status: 'CANCELLED' as any, processedAt: now },
          })
          return { status: 'APPROVED', finished: true, instanceStatus: 'REJECTED' }
        }
      }

      const quorum = jnode.approver?.quorum ?? 100
      const reached = total > 0 && (approvedN * 100) >= total * quorum
      if (!reached) {
        return { status: 'APPROVED', finished: false, instanceStatus: inst.status }
      }
      // 会签达成 → 取消其它 PENDING
      await tx.approvalNodeInstance.updateMany({
        where: { instanceId: inst.id, nodeId: dbNode.id, status: 'PENDING' as any },
        data: { status: 'CANCELLED' as any, processedAt: now },
      })
    }

    // 或签：首个 APPROVE 即达成
    if (jnode.type === 'APPROVER_ORSIGN') {
      await tx.approvalNodeInstance.updateMany({
        where: { instanceId: inst.id, nodeId: dbNode.id, status: 'PENDING' as any, NOT: { id: ni.id } },
        data: { status: 'CANCELLED' as any, processedAt: now },
      })
    }

    // 推进后继节点
    const nextKeys = jnode.next ?? []
    const adv = await advance({
      tx, workflow, dbNodes: workflow.nodes, def, instance: inst, record,
      fromKeys: nextKeys,
      context: { initiatorId: inst.initiatorId, lastApproverId: opts.assigneeId },
      ip: opts.ip, ua: opts.ua,
    })

    if (adv.reachedEnd) {
      await tx.approvalInstance.update({ where: { id: inst.id }, data: { status: 'APPROVED' as any, completedAt: now } })
    }

    return {
      status: 'APPROVED',
      instanceStatus: adv.reachedEnd ? 'APPROVED' : (inst.status as string),
      finished: adv.reachedEnd,
      nextNodeKeys: nextKeys,
      newAssignees: adv.assignees,
      ccTargets: adv.ccTargets,
    }
  }

  if (opts.tx) return run(opts.tx as Tx)
  return prisma.$transaction(run as any, { maxWait: 60_000, timeout: 120_000 })
}

// ═══════════════════════════════════════════════════════════════
//  撤回
// ═══════════════════════════════════════════════════════════════

export async function revokeInstance(
  instanceId: number,
  revokerId: number,
  reason?: string,
  ip?: string | null,
  ua?: string | null,
): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const inst = await tx.approvalInstance.findUnique({ where: { id: instanceId } })
    if (!inst) throw new Error('instance not found')
    if (inst.initiatorId !== revokerId) throw new Error('only initiator can revoke')

    const nis = await tx.approvalNodeInstance.findMany({ where: { instanceId } })
    const processed = nis.filter(n => n.status !== 'PENDING')
    if (processed.length) throw new Error('cannot revoke: some node already processed')

    await tx.approvalInstance.update({
      where: { id: instanceId },
      data: { status: 'CANCELLED' as any, cancelledAt: new Date(), cancelReason: reason ?? null },
    })
    await tx.approvalNodeInstance.updateMany({
      where: { instanceId, status: 'PENDING' as any },
      data: {
        status: 'CANCELLED' as any, processedAt: new Date(),
        action: 'REVOKE' as any, comment: '发起人撤回',
        ipAddress: ip ?? undefined, userAgent: ua ?? undefined,
      },
    })
    await appendChain(tx, instanceId, {
      nodeId: null, nodeKey: null, assigneeId: revokerId,
      action: 'REVOKE', at: new Date().toISOString(), comment: reason ?? null,
    })
    return true
  })
}

// ═══════════════════════════════════════════════════════════════
//  超时扫描
// ═══════════════════════════════════════════════════════════════

export async function scanTimeout(limit = 200): Promise<{ id: number; action: string }[]> {
  const now = new Date()
  return prisma.$transaction(async tx => {
    const pendings = await tx.approvalNodeInstance.findMany({
      where: { status: 'PENDING' as any, dueAt: { lte: now } },
      take: limit,
      include: { node: true, instance: { include: { workflow: true } } },
    })

    const results: { id: number; action: string }[] = []

    for (const ni of pendings) {
      try {
        // 从 jsonDefinition 中读取超时动作
        const def = parseDefinition(ni.instance.workflow)
        const jnode = def ? nodeById(def, ni.node.nodeKey!) : null
        const policy: any = deepParse(ni.instance.workflow.timeoutPolicy) ?? {}

        const nodeAction = jnode?.timeout?.action ?? policy.defaultAction ?? 'NONE'
        if (nodeAction === 'NONE') {
          results.push({ id: ni.id, action: 'NONE' })
          continue
        }

        const action: 'TIMEOUT_PASS' | 'TIMEOUT_REJECT' =
          nodeAction === 'AUTO_REJECT' ? 'TIMEOUT_REJECT' : 'TIMEOUT_PASS'

        await applyAction({
          nodeInstanceId: ni.id,
          assigneeId: ni.assigneeId ?? 0,
          action,
          comment: `系统超时自动${action === 'TIMEOUT_PASS' ? '通过' : '驳回'}`,
          tx: tx as any,
          ip: 'system://timeout',
          ua: 'system',
        })
        results.push({ id: ni.id, action })
      } catch (e) {
        results.push({ id: ni.id, action: `SKIP:${(e as Error).message}` })
      }
    }

    return results
  })
}
