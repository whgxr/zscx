import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const batchUpdateSchema = z.object({
  fieldIds: z.array(z.number()).min(1, '至少选择一个字段'),
  showInList: z.boolean().optional(),
  showInForm: z.boolean().optional(),
  showInSearch: z.boolean().optional(),
})

export async function PUT(
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
    const data = batchUpdateSchema.parse(body)

    // 构建更新数据，只包含提供的字段
    const updateData: any = {}
    if (data.showInList !== undefined) updateData.showInList = data.showInList
    if (data.showInForm !== undefined) updateData.showInForm = data.showInForm
    if (data.showInSearch !== undefined) updateData.showInSearch = data.showInSearch

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ message: '没有需要更新的字段' }, { status: 400 })
    }

    const result = await prisma.tableField.updateMany({
      where: {
        id: { in: data.fieldIds },
        tableId,
      },
      data: updateData,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'BATCH_UPDATE_FIELDS_DISPLAY',
        module: 'TABLE',
        tableId,
        detail: {
          fieldIds: data.fieldIds,
          updated: result.count,
          changes: updateData,
        } as any,
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
    console.error('Batch update fields error:', error)
    return NextResponse.json({ message: '批量更新字段失败' }, { status: 500 })
  }
}
