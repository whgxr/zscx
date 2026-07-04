import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const reorderSchema = z.object({
  fieldIds: z.array(z.number()).min(1, '字段ID列表不能为空'),
})

export async function PUT(
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

    const body = await req.json()
    const data = reorderSchema.parse(body)

    const table = await prisma.dataTable.findUnique({ where: { id: tableId } })
    if (!table) {
      return NextResponse.json({ message: '项目不存在' }, { status: 404 })
    }

    const fields = await prisma.tableField.findMany({
      where: { tableId },
      select: { id: true },
    })
    const existingIds = new Set(fields.map((f) => f.id))

    const invalidIds = data.fieldIds.filter((id) => !existingIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { message: `无效的字段ID: ${invalidIds.join(', ')}` },
        { status: 400 }
      )
    }

    if (data.fieldIds.length !== existingIds.size) {
      return NextResponse.json(
        { message: '字段ID数量不匹配，需包含所有字段' },
        { status: 400 }
      )
    }

    await prisma.$transaction(async (tx) => {
      const updates = data.fieldIds.map((fieldId, index) =>
        tx.tableField.update({
          where: { id: fieldId },
          data: { sortOrder: index + 1 },
        })
      )
      await Promise.all(updates)
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'REORDER_FIELDS',
        module: 'TABLE',
        tableId,
        detail: { fieldIds: data.fieldIds },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Reorder fields error:', error)
    return NextResponse.json({ message: '排序失败' }, { status: 500 })
  }
}
