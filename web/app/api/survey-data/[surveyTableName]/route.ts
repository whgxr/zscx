import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { FieldType } from '@prisma/client'

// GET /api/survey-data/[surveyTableName]
// 用于 LEVY_RELATION 字段在表单里"选择调查记录"：支持关键字搜索（在 labelField 指定字段或默认字段中）、分页
export async function GET(
  req: NextRequest,
  { params }: { params: { surveyTableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.surveyTableName },
      include: { fields: true },
    })
    if (!table) {
      return NextResponse.json({ message: '调查数据表不存在' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const keyword = searchParams.get('keyword')?.trim() || ''
    const page = parseInt(searchParams.get('page') || '1', 10)
    const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20', 10), 100)
    const excludeIds = searchParams.get('excludeIds')
      ? searchParams.get('excludeIds')!.split(',').map(s => parseInt(s, 10)).filter(n => !isNaN(n))
      : []

    // 找一个"显示用"字段：优先 TEXT / TEXTAREA
    const displayField = table.fields.find(f =>
      f.type === FieldType.TEXT || f.type === FieldType.TEXTAREA
    )
    const displayName = displayField?.name || 'id'

    const where: any = { tableId: table.id }
    if (keyword) {
      where.data = {
        path: [displayName],
        string_contains: keyword,
      }
    }
    if (excludeIds.length) {
      where.id = { notIn: excludeIds }
    }

    const [records, total] = await Promise.all([
      prisma.dataRecord.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          data: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.dataRecord.count({ where }),
    ])

    return NextResponse.json({
      table: { id: table.id, name: table.name, label: table.label, displayField: displayName },
      records: records.map(r => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        displayValue: (r.data as any)?.[displayName] ?? `#${r.id}`,
        data: r.data,
      })),
      page,
      pageSize,
      total,
    })
  } catch (error) {
    console.error('[api/survey-data] error:', error)
    return NextResponse.json({ message: '查询调查记录失败' }, { status: 500 })
  }
}
