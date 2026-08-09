import { NextRequest, NextResponse } from 'next/server'
import { startInstance } from '@/lib/approval-service'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const body = await req.json()

    const tableId = Number(body.tableId)
    const recordId = Number(body.recordId)
    if (!tableId || !recordId) {
      return NextResponse.json({ ok: false, error: '缺少必填参数 tableId / recordId' }, { status: 400 })
    }

    const fwd = req.headers.get('x-forwarded-for')
    const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? null)

    const result = await startInstance({
      tableId,
      recordId,
      initiatorId: user.id,
      triggerEvent: body.triggerEvent || 'MANUAL_SUBMIT',
      workflowIdOverride: body.workflowId ? Number(body.workflowId) : null,
      workflowVersionOverride: body.workflowVersion,
      expectUpdatedAt: body.expectUpdatedAt ?? null,
      snapshotDataAfter: body.snapshotDataAfter ?? null,
      ip,
      ua: req.headers.get('user-agent') ?? null,
    })

    if (!result.ok) {
      return NextResponse.json(result, { status: result.status ?? 500 })
    }
    return NextResponse.json(result)
  } catch (e) {
    console.error('startInstance route:', e)
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

/**
 * GET /api/approval/v2/instances?scope=&page=&pageSize=&status=&tableId=&recordId=
 *   scope:
 *     pending  我的待办（某节点实例分配给我，且 PENDING / APPROVING / COUNTERSIGNING）
 *     mine     我发起的
 *     cc       抄送给我
 *     all      我能看（我发起 + 待我办 + 抄我）（管理员能看全部）
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))
    const scope = searchParams.get('scope') ?? 'pending'
    const status = searchParams.get('status') ?? undefined
    const tableId = searchParams.get('tableId') ? Number(searchParams.get('tableId')) : undefined
    const recordId = searchParams.get('recordId') ? Number(searchParams.get('recordId')) : undefined
    const keyword = searchParams.get('keyword') ?? undefined

    const isAdmin =
      user.role?.name === 'ADMIN' ||
      !!user.role?.canManageApproval ||
      !!user.role?.canManageTables

    const where: any = {}
    if (status) where.status = status
    if (tableId) where.tableId = tableId
    if (recordId) where.recordId = recordId

    if (scope === 'pending') {
      where.nodeInstances = {
        some: {
          assigneeId: user.id,
          status: { in: ['PENDING', 'APPROVING', 'COUNTERSIGNING'] }
        }
      }
    } else if (scope === 'mine') {
      where.initiatorId = user.id
    } else if (scope === 'cc') {
      where.ccList = { has: user.id }
    } else if (scope === 'all' && !isAdmin) {
      where.OR = [
        { initiatorId: user.id },
        { nodeInstances: { some: { assigneeId: user.id } } },
        { ccList: { has: user.id } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.approvalInstance.findMany({
        where,
        include: {
          workflow: { select: { id: true, name: true, version: true } },
          table: { select: { id: true, label: true, name: true } },
          record: { select: { id: true, status: true, updatedAt: true } },
          initiator: { select: { id: true, realName: true, username: true, avatar: true } },
          nodeInstances: {
            orderBy: [{ id: 'asc' }],
            include: {
              node: { select: { id: true, nodeKey: true, nodeName: true, nodeType: true } },
              assignee: { select: { id: true, realName: true, username: true, avatar: true } },
              transferredUser: { select: { id: true, realName: true, username: true } },
              transferredFromUser: { select: { id: true, realName: true, username: true } },
            }
          }
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { startedAt: 'desc' },
      }),
      prisma.approvalInstance.count({ where })
    ])

    let data = rows as any[]
    if (keyword) {
      const kw = keyword.toLowerCase()
      data = data.filter(r =>
        String(r.id).includes(kw) ||
        r.initiator?.realName?.toLowerCase()?.includes(kw) ||
        r.initiator?.username?.toLowerCase()?.includes(kw)
      )
    }

    return NextResponse.json({ ok: true, data, total: keyword ? data.length : total, page, pageSize })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '查询失败' }, { status: 500 })
  }
}
