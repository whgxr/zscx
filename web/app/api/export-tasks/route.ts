import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// 记录导出历史的操作类型（对应各导出路由写入的 operationLog.action）
const EXPORT_ACTIONS = [
  'EXPORT_EXCEL',
  'EXPORT_PDF',
  'DOC_DOWNLOAD',
  'DOC_PREVIEW',
  'DOC_PRINT',
]

const ACTION_LABEL: Record<string, string> = {
  EXPORT_EXCEL: 'Excel 导出',
  EXPORT_PDF: 'PDF 导出',
  DOC_DOWNLOAD: '文书下载',
  DOC_PREVIEW: '文书预览',
  DOC_PRINT: '文书打印',
}

/**
 * GET /api/export-tasks?page=&pageSize=
 * 查询当前用户的导出历史（基于 OperationLog）
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
    const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize') ?? '20')))

    const where = {
      userId: user.id,
      action: { in: EXPORT_ACTIONS },
    }

    const [rows, total] = await Promise.all([
      prisma.operationLog.findMany({
        where,
        include: {
          table: { select: { id: true, label: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.operationLog.count({ where }),
    ])

    const data = rows.map((log: any) => {
      const detail = typeof log.detail === 'string' ? JSON.parse(log.detail) : (log.detail ?? {})
      return {
        id: log.id,
        action: log.action,
        actionLabel: ACTION_LABEL[log.action] ?? log.action,
        module: log.module,
        table: log.table ? { id: log.table.id, label: log.table.label, name: log.table.name } : null,
        fileName: detail?.fileName ?? null,
        templateId: detail?.templateId ?? null,
        recordCount: detail?.recordCount ?? null,
        format: detail?.format ?? null,
        createdAt: log.createdAt,
      }
    })

    return NextResponse.json({ ok: true, data, total, page, pageSize })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '查询失败' }, { status: 500 })
  }
}
