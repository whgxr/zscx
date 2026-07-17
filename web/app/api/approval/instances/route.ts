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

    const where: any = {}
    if (status) {
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
      where.id = { in: nodeInstances.map(ni => ni.instanceId) }
    }

    const [instances, total] = await Promise.all([
      prisma.approvalInstance.findMany({
        where,
        include: {
          table: { select: { label: true, name: true } },
          initiator: { select: { realName: true, username: true } },
          nodeInstances: {
            include: {
              node: true,
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

    return NextResponse.json({ instances, total, page, pageSize })
  } catch (error) {
    console.error('Get instances error:', error)
    return NextResponse.json({ message: '获取审批实例列表失败' }, { status: 500 })
  }
}