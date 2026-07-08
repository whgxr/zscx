import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { FieldType } from '@prisma/client'

const createFieldSchema = z.object({
  name: z.string().min(1, '字段名不能为空').regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '字段名只能包含字母、数字和下划线'),
  label: z.string().min(1, '显示名称不能为空'),
  type: z.nativeEnum(FieldType),
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional().default(false),
  sortOrder: z.number().optional().default(0),
  description: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  defaultValue: z.string().nullable().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).nullable().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
  }).nullable().optional(),
  config: z.any().optional(),
  showInList: z.boolean().optional().default(true),
  showInForm: z.boolean().optional().default(true),
  showInSearch: z.boolean().optional().default(true),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const tableId = parseInt(params.id)
    if (isNaN(tableId)) {
      return NextResponse.json({ message: '无效的表ID' }, { status: 400 })
    }

    const fields = await prisma.tableField.findMany({
      where: { tableId },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ fields })
  } catch (error) {
    console.error('Get fields error:', error)
    return NextResponse.json({ message: '获取字段列表失败' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const tableId = parseInt(params.id)
    if (isNaN(tableId)) {
      return NextResponse.json({ message: '无效的表ID' }, { status: 400 })
    }

    const body = await req.json()
    const data = createFieldSchema.parse(body)

    const existing = await prisma.tableField.findFirst({
      where: { tableId, name: data.name },
    })

    if (existing) {
      return NextResponse.json({ message: '字段名已存在' }, { status: 400 })
    }

    const maxSortOrder = await prisma.tableField.aggregate({
      where: { tableId },
      _max: { sortOrder: true },
    })

    const field = await prisma.tableField.create({
      data: {
        ...data,
        tableId,
        sortOrder: (maxSortOrder._max.sortOrder || 0) + 1,
      } as any,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_FIELD',
        module: 'TABLE',
        tableId,
        detail: { name: data.name, label: data.label, type: data.type },
      },
    })

    return NextResponse.json({ field })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Create field error:', error)
    return NextResponse.json({ message: '创建字段失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const tableId = parseInt(params.id)
    if (isNaN(tableId)) {
      return NextResponse.json({ message: '无效的表ID' }, { status: 400 })
    }

    const body = await req.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ message: '请选择要删除的字段' }, { status: 400 })
    }

    const systemFields = await prisma.tableField.findMany({
      where: { id: { in: ids }, isSystem: true },
    })

    if (systemFields.length > 0) {
      return NextResponse.json({ message: '无法删除系统字段' }, { status: 400 })
    }

    await prisma.tableField.deleteMany({
      where: { id: { in: ids }, tableId },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'BATCH_DELETE_FIELDS',
        module: 'TABLE',
        tableId,
        detail: { count: ids.length },
      },
    })

    return NextResponse.json({ message: '批量删除成功' })
  } catch (error) {
    console.error('Batch delete fields error:', error)
    return NextResponse.json({ message: '批量删除失败' }, { status: 500 })
  }
}
