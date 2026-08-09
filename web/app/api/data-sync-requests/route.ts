import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { applyApprovedSyncRequest, rejectSyncRequest } from '@/lib/levy-sync-detector'

// GET /api/data-sync-requests
// 同步请求列表查询（用于管理员/征收操作人 审核队列）
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') // PENDING | APPROVED | REJECTED
    const source = searchParams.get('source') as 'SURVEY' | 'LEVY' | null
    const surveyTableId = searchParams.get('surveyTableId') ? parseInt(searchParams.get('surveyTableId')!) : undefined
    const surveyRecordId = searchParams.get('surveyRecordId') ? parseInt(searchParams.get('surveyRecordId')!) : undefined
    const levyTableId = searchParams.get('levyTableId') ? parseInt(searchParams.get('levyTableId')!) : undefined
    const levyRecordId = searchParams.get('levyRecordId') ? parseInt(searchParams.get('levyRecordId')!) : undefined
    const requestedBy = searchParams.get('requestedBy') ? parseInt(searchParams.get('requestedBy')!) : undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 200)

    const where: any = {}
    if (status) where.status = status
    if (source) where.source = source
    if (surveyTableId) where.surveyTableId = surveyTableId
    if (surveyRecordId) where.surveyRecordId = surveyRecordId
    if (levyTableId) where.levyTableId = levyTableId
    if (levyRecordId) where.levyRecordId = levyRecordId
    if (requestedBy) where.requestedBy = requestedBy

    const [items, total] = await Promise.all([
      prisma.dataSyncRequest.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          snapshot: { include: { table: { select: { id: true, name: true, label: true } } } },
          surveyTable: { select: { id: true, name: true, label: true } },
          levyTable: { select: { id: true, name: true, label: true } },
          surveyRecord: { select: { id: true, status: true } },
          levyRecord: { select: { id: true, status: true } },
          requester: { select: { id: true, username: true, realName: true } },
          reviewer: { select: { id: true, username: true, realName: true } },
        },
      }),
      prisma.dataSyncRequest.count({ where }),
    ])

    return NextResponse.json({ items, total, page, pageSize })
  } catch (error) {
    console.error('[api/data-sync-requests GET] error:', error)
    return NextResponse.json({ message: '查询同步请求失败' }, { status: 500 })
  }
}

// POST /api/data-sync-requests/[id]/review  -> 由下面单独 route 处理
