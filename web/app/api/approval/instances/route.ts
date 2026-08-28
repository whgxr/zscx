import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const status = searchParams.get('status') || undefined
    const tableId = searchParams.get('tableId') ? parseInt(searchParams.get('tableId')!) : undefined
    const myApproval = searchParams.get('myApproval') === 'true'

    // status 只接受合法的 prisma InstanceStatus 枚举值；非法枚举（如 pending/all 等来自旧前端/脚本的拼错）直接忽略，避免 500。
    const VALID_STATUS = new Set(['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'CANCELLED', 'RESTARTED'])
    const where: any = {}
    if (status && VALID_STATUS.has(status)) {
      where.status = status
    }
    if (tableId) {
      where.tableId = tableId
    }

    if (myApproval) {
      const nodeInstances = await prisma.approvalNodeInstance.findMany({
        where: { assigneeId: user.id, status: 'PENDING' },
        select: { instanceId: true },
      })
      where.id = { in: nodeInstances.map((ni: { instanceId: number }) => ni.instanceId) }
    }

    const [instances, total] = await Promise.all([
      prisma.approvalInstance.findMany({
        where,
        include: {
          table: { select: { label: true, name: true } },
          initiator: { select: { realName: true, username: true } },
          nodeInstances: {
            include: {
              // node 使用单独查询补全，防止孤儿 nodeId 导致 Prisma 必填报错
              assignee: { select: { realName: true } },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.approvalInstance.count({ where }),
    ])

    // ---- 防御性补全 nodeInstances[].node ----
    const nis = (instances as any[]).flatMap(i => i.nodeInstances ?? [])
    const nodeIds = [...new Set(nis.map((n: any) => n.nodeId).filter(Boolean))] as number[]
    const nodeMap = new Map<number, any>()
    if (nodeIds.length > 0) {
      const nodes = await prisma.approvalNode.findMany({
        where: { id: { in: nodeIds } }
      })
      nodes.forEach(n => nodeMap.set(n.id, n))
    }
    for (const inst of instances as any[]) {
      for (const ni of inst.nodeInstances ?? []) {
        ni.node = nodeMap.get(ni.nodeId) ?? {
          id: ni.nodeId, nodeKey: 'DELETED', nodeName: '[节点已删除]', nodeType: 'UNKNOWN'
        }
      }
    }

    return NextResponse.json({ instances, total, page, pageSize })
  } catch (error) {
    console.error('Get instances error:', error)
    return NextResponse.json({ message: '获取审批实例列表失败' }, { status: 500 })
  }
}