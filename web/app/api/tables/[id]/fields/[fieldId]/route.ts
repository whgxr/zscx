import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { FieldType } from '@prisma/client'

const updateFieldSchema = z.object({
  label: z.string().min(1, '显示名称不能为空').optional(),
  type: z.nativeEnum(FieldType).optional(),
  required: z.boolean().optional(),
  unique: z.boolean().optional(),
  sortOrder: z.number().optional(),
  description: z.string().nullable().optional(),
  placeholder: z.string().nullable().optional(),
  defaultValue: z.string().nullable().optional(),
  options: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).nullable().optional(),
  validation: z.any().optional(),
  config: z.any().optional(),
  showInList: z.boolean().optional(),
  showInForm: z.boolean().optional(),
  showInSearch: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string; fieldId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const fieldId = parseInt(params.fieldId)
    if (isNaN(fieldId)) {
      return NextResponse.json({ message: '无效的字段ID' }, { status: 400 })
    }

    const body = await req.json()
    const data = updateFieldSchema.parse(body)

    const field = await prisma.tableField.findUnique({
      where: { id: fieldId },
    })

    if (!field) {
      return NextResponse.json({ message: '字段不存在' }, { status: 404 })
    }

    if (field.isSystem) {
      return NextResponse.json({ message: '系统字段不可修改' }, { status: 400 })
    }

    const updatedField = await prisma.tableField.update({
      where: { id: fieldId },
      data: data as any,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_FIELD',
        module: 'TABLE',
        tableId: field.tableId,
        detail: { fieldId, ...data } as any,
      },
    })

    return NextResponse.json({ field: updatedField })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Update field error:', error)
    return NextResponse.json({ message: '更新字段失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; fieldId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const fieldId = parseInt(params.fieldId)
    if (isNaN(fieldId)) {
      return NextResponse.json({ message: '无效的字段ID' }, { status: 400 })
    }

    const field = await prisma.tableField.findUnique({
      where: { id: fieldId },
    })

    if (!field) {
      return NextResponse.json({ message: '字段不存在' }, { status: 404 })
    }

    if (field.isSystem) {
      return NextResponse.json({ message: '系统字段不可删除' }, { status: 400 })
    }

    await prisma.tableField.delete({ where: { id: fieldId } })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_FIELD',
        module: 'TABLE',
        tableId: field.tableId,
        detail: { fieldId, name: field.name, label: field.label },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete field error:', error)
    return NextResponse.json({ message: '删除字段失败' }, { status: 500 })
  }
}
