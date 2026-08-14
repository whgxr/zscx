import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

/**
 * GET /api/data/{tableName}/{id}/snapshots
 *   查询某条记录的「数据快照/变更历史」时间线。
 *   数据来源：OperationLog（所有 CRUD/同步/审批都落日志）+ 关联 DataSnapshot（before/after/diff）。
 *   校验逻辑与详情接口一致（登录 + 查看权限）。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canView) {
        return NextResponse.json({ message: '无权限查看此数据' }, { status: 403 })
      }
    }

    const recordId = parseInt(params.id)
    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
    })
    if (!record || record.tableId !== table.id) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    // 该记录的全部操作日志（按时间倒序），附关联的快照与操作人
    const logs = await prisma.operationLog.findMany({
      where: { tableId: table.id, recordId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, realName: true, avatar: true } },
        snapshot: {
          select: {
            id: true,
            beforeData: true,
            afterData: true,
            diff: true,
            changeType: true,
            createdAt: true,
            changedBy: true,
          },
        },
        syncRequest: {
          select: {
            id: true,
            status: true,
            source: true,
            fieldDiffs: true,
            snapshotId: true,
            snapshot: {
              select: {
                id: true,
                beforeData: true,
                afterData: true,
                diff: true,
                changeType: true,
                createdAt: true,
                changedBy: true,
              },
            },
          },
        },
        approvalInstance: { select: { id: true, status: true } },
      },
    })

    // 同步请求的差异快照挂在 DataSyncRequest.snapshot 上（OperationLog 只存 syncRequestId）。
    // 把该快照归一化到 log.snapshot，前端即可统一展示 before/after 差异。
    const normalized = logs.map((log: any) => {
      if (!log.snapshot && log.syncRequest?.snapshot) {
        log.snapshot = log.syncRequest.snapshot
      }
      return log
    })

    return NextResponse.json({ ok: true, data: normalized, total: normalized.length })
  } catch (e: any) {
    console.error('Get record snapshots error:', e)
    return NextResponse.json({ message: '获取数据快照失败' }, { status: 500 })
  }
}
