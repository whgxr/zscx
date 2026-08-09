import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5ApprovalClient } from './approval-client'

export default async function H5ApprovalPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  // 我的待办：当前分配给我、状态为 PENDING 的节点
  const todoRaw = await prisma.approvalNodeInstance.findMany({
    where: { status: 'PENDING', assigneeId: user.id },
    include: {
      instance: {
        include: {
          workflow: { select: { id: true, name: true } },
          table: { select: { id: true, name: true, label: true } },
          record: { select: { id: true, data: true, status: true } },
          initiator: { select: { id: true, realName: true, username: true } },
        },
      },
    },
    orderBy: [{ instanceId: 'desc' }, { id: 'asc' }],
    take: 100,
  }).catch(() => [])

  // 我发起的
  const mineRaw = await prisma.approvalInstance.findMany({
    where: { initiatorId: user.id },
    include: {
      workflow: { select: { id: true, name: true } },
      table: { select: { id: true, name: true, label: true } },
      record: { select: { id: true, data: true, status: true } },
      nodeInstances: {
        orderBy: { id: 'asc' },
        include: { assignee: { select: { id: true, realName: true, username: true } } },
      },
    },
    orderBy: [{ id: 'desc' }],
    take: 100,
  }).catch(() => [])

  const todo = (todoRaw as any[]).map((n) => ({
    nodeId: n.id,
    instanceId: n.instance.id,
    workflowName: n.instance.workflow?.name,
    table: n.instance.table,
    record: n.instance.record,
    initiator: n.instance.initiator,
    startedAt: n.instance.startedAt,
    dueAt: n.dueAt,
    countersignTotal: n.countersignTotal,
    countersignApprovedCount: n.countersignApprovedCount,
  }))

  const mine = (mineRaw as any[]).map((inst) => ({
    instanceId: inst.id,
    workflowName: inst.workflow?.name,
    status: inst.status,
    table: inst.table,
    record: inst.record,
    startedAt: inst.startedAt,
    completedAt: inst.completedAt,
    chain: (inst.nodeInstances || []).map((n: any) => ({
      assignee: n.assignee,
      status: n.status,
      action: n.action,
      processedAt: n.processedAt,
      comment: n.comment,
    })),
  }))

  return <H5ApprovalClient userId={user.id} todo={JSON.parse(JSON.stringify(todo))} mine={JSON.parse(JSON.stringify(mine))} />
}
