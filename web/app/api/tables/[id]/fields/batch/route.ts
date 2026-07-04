import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { FieldType } from '@prisma/client'

const batchFieldSchema = z.object({
  name: z.string().min(1, '字段名不能为空').regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '字段名只能包含字母、数字和下划线'),
  label: z.string().min(1, '显示名称不能为空'),
  type: z.nativeEnum(FieldType),
  required: z.boolean().optional().default(false),
  showInList: z.boolean().optional().default(true),
  showInForm: z.boolean().optional().default(true),
  showInSearch: z.boolean().optional().default(true),
})

const batchImportSchema = z.object({
  fields: z.array(batchFieldSchema).min(1, '至少导入一个字段'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const tableId = parseInt(params.id)
    if (isNaN(tableId)) {
      return NextResponse.json({ message: '无效的表ID' }, { status: 400 })
    }

    const table = await prisma.dataTable.findUnique({ where: { id: tableId } })
    if (!table) {
      return NextResponse.json({ message: '项目不存在' }, { status: 404 })
    }

    const body = await req.json()
    const data = batchImportSchema.parse(body)

    const existingFields = await prisma.tableField.findMany({
      where: { tableId },
      select: { name: true },
    })
    const existingNames = new Set(existingFields.map((f) => f.name))

    const duplicateNames = data.fields.filter((f) => existingNames.has(f.name))
    if (duplicateNames.length > 0) {
      return NextResponse.json(
        { message: `字段名已存在: ${duplicateNames.map((f) => f.name).join(', ')}` },
        { status: 400 }
      )
    }

    const nameCounts: Record<string, number> = {}
    for (const field of data.fields) {
      nameCounts[field.name] = (nameCounts[field.name] || 0) + 1
    }
    const dupInBatch = Object.entries(nameCounts).filter(([, count]) => count > 1)
    if (dupInBatch.length > 0) {
      return NextResponse.json(
        { message: `导入数据中存在重复字段名: ${dupInBatch.map(([name]) => name).join(', ')}` },
        { status: 400 }
      )
    }

    const maxSortOrderResult = await prisma.tableField.aggregate({
      where: { tableId },
      _max: { sortOrder: true },
    })
    let currentSortOrder = maxSortOrderResult._max.sortOrder || 0

    const fieldsToCreate = data.fields.map((field) => ({
      tableId,
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      sortOrder: ++currentSortOrder,
      showInList: field.showInList,
      showInForm: field.showInForm,
      showInSearch: field.showInSearch,
    }))

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.tableField.createMany({
        data: fieldsToCreate as any[],
      })
      return created
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'BATCH_CREATE_FIELDS',
        module: 'TABLE',
        tableId,
        detail: {
          count: result.count,
          fields: data.fields.map((f) => ({ name: f.name, label: f.label, type: f.type })),
        },
      },
    })

    return NextResponse.json({ count: result.count })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Batch import fields error:', error)
    return NextResponse.json({ message: '批量导入字段失败' }, { status: 500 })
  }
}
