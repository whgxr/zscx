import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const updateTableSchema = z.object({
  name: z.string().min(1, '表名不能为空').optional(),
  label: z.string().min(1, '显示名称不能为空').optional(),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  sortOrder: z.number().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'DRAFT']).optional(),
  formLayoutConfig: z.any().optional(),
  isDetailTable: z.boolean().optional(),
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

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的ID' }, { status: 400 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { id },
      include: {
        category: true,
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    return NextResponse.json({ table })
  } catch (error) {
    console.error('Get table error:', error)
    return NextResponse.json({ message: '获取数据表失败' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的ID' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateTableSchema.parse(body)

    // 只有管理员可以修改表名和显示名称
    if ((data.name || data.label) && user.role?.name !== 'ADMIN') {
      return NextResponse.json(
        { message: '只有系统管理员可以修改表名和显示名称' },
        { status: 403 }
      )
    }

    const table = await prisma.dataTable.update({
      where: { id },
      data,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_TABLE',
        module: 'TABLE',
        tableId: id,
        detail: data,
      },
    })

    return NextResponse.json({ table })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Update table error:', error)
    return NextResponse.json({ message: '更新数据表失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的ID' }, { status: 400 })
    }

    const recordCount = await prisma.dataRecord.count({ where: { tableId: id } })
    if (recordCount > 0) {
      return NextResponse.json(
        { message: '该表下存在数据记录，无法删除' },
        { status: 400 }
      )
    }

    await prisma.tableField.deleteMany({ where: { tableId: id } })
    await prisma.tablePermission.deleteMany({ where: { tableId: id } })
    await prisma.dataTable.delete({ where: { id } })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_TABLE',
        module: 'TABLE',
        tableId: id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete table error:', error)
    return NextResponse.json({ message: '删除数据表失败' }, { status: 500 })
  }
}
