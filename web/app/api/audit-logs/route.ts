import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/audit-logs
 *   查询参数：
 *     tab: data | approval | sync | document | auth  (空=全部)
 *     page, pageSize
 *     userId, tableId, recordId, approvalInstanceId, syncRequestId,
 *     module, action, keyword, from, to (YYYY-MM-DD)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })
    const isAdmin = user.role?.name === 'ADMIN' || !!user.role?.canViewLogs
    if (!isAdmin) return NextResponse.json({ message: '无权限' }, { status: 403 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))
    const tab = searchParams.get('tab') ?? ''

    const where: any = {}
    // tab 预分类
    if (tab === 'data') {
      where.OR = [
        { module: { in: ['DATA', 'SURVEY', 'LEVY', 'RECORD'] } },
        { action: { startsWith: 'CREATE_RECORD' } },
        { action: { startsWith: 'UPDATE_RECORD' } },
        { action: { startsWith: 'DELETE_RECORD' } },
        { action: { startsWith: 'DATA_' } },
      ]
    } else if (tab === 'approval') {
      where.OR = [
        { approvalInstanceId: { not: null } },
        { module: { startsWith: 'APPROVAL' } },
        { action: { startsWith: 'APPROVAL' } },
      ]
    } else if (tab === 'sync') {
      where.syncRequestId = { not: null }
    } else if (tab === 'document') {
      where.OR = [
        { module: { in: ['EXPORT', 'DOCUMENT', 'PRINT', 'DOCX'] } },
        { action: { startsWith: 'EXPORT_' } },
        { action: { startsWith: 'PRINT_' } },
        { action: { startsWith: 'DOC_' } },
        { action: { startsWith: 'DOCUMENT_' } },
        { action: { startsWith: 'GENERATE_' } },
      ]
    } else if (tab === 'auth') {
      where.OR = [
        { module: 'AUTH' },
        { action: { in: ['LOGIN', 'LOGOUT', 'LOGIN_FAIL', 'CHANGE_PASSWORD', 'TOKEN_REFRESH'] } },
      ]
    }

    const userId = searchParams.get('userId'); if (userId) where.userId = Number(userId)
    const tableId = searchParams.get('tableId'); if (tableId) where.tableId = Number(tableId)
    const recordId = searchParams.get('recordId'); if (recordId) where.recordId = Number(recordId)
    const ai = searchParams.get('approvalInstanceId'); if (ai) where.approvalInstanceId = Number(ai)
    const si = searchParams.get('syncRequestId'); if (si) where.syncRequestId = Number(si)
    const mod = searchParams.get('module'); if (mod) where.module = mod
    const act = searchParams.get('action'); if (act) where.action = act
    const from = searchParams.get('from'); const to = searchParams.get('to')
    if (from || to) {
      where.createdAt = {} as any
      if (from) where.createdAt.gte = new Date(from + 'T00:00:00')
      if (to) where.createdAt.lte = new Date(to + 'T23:59:59')
    }

    const [rows, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, username: true, realName: true, avatar: true } },
          snapshot: { select: { id: true, beforeData: true, afterData: true, changeType: true, createdAt: true, changedBy: true } },
          syncRequest: { select: { id: true, status: true, source: true, surveyTableId: true, levyTableId: true } },
          table: { select: { id: true, name: true, label: true, categoryId: true } },
          approvalInstance: { select: { id: true, status: true } },
        },
      }),
      prisma.operationLog.count({ where }),
    ])

    // keyword 过滤（简易的服务端）
    const kw = searchParams.get('keyword')?.trim().toLowerCase()
    let list = rows as any[]
    if (kw) {
      list = list.filter((r: any) =>
        (r.action || '').toLowerCase().includes(kw) ||
        (r.module || '').toLowerCase().includes(kw) ||
        (r.detail && JSON.stringify(r.detail).toLowerCase().includes(kw)) ||
        (r.user?.realName || '').toLowerCase().includes(kw) ||
        (r.user?.username || '').toLowerCase().includes(kw) ||
        (r.ipAddress || '').includes(kw)
      )
    }

    return NextResponse.json({ ok: true, data: list, total: kw ? list.length : total, page, pageSize })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '获取失败' }, { status: 500 })
  }
}
