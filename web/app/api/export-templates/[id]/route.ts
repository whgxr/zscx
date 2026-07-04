import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const updateTemplateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空').optional(),
  description: z.string().optional().nullable(),
  config: z.record(z.any()).optional(),
  isDefault: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const templateId = parseInt(params.id)
    const template = await prisma.exportTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      return NextResponse.json({ message: '模板不存在' }, { status: 404 })
    }

    if (template.isSystem) {
      return NextResponse.json({ message: '系统模板不能修改' }, { status: 403 })
    }

    if (template.createdBy !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ message: '无权限修改此模板' }, { status: 403 })
    }

    const body = await req.json()
    const data = updateTemplateSchema.parse(body)

    if (data.isDefault) {
      await prisma.exportTemplate.updateMany({
        where: {
          tableId: template.tableId,
          format: template.format,
          createdBy: user.id,
          isDefault: true,
          id: { not: templateId },
        },
        data: { isDefault: false },
      })
    }

    const updatedTemplate = await prisma.exportTemplate.update({
      where: { id: templateId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.config !== undefined && { config: data.config as any }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_EXPORT_TEMPLATE',
        module: 'EXPORT',
        tableId: template.tableId,
        detail: { templateId } as any,
      },
    })

    return NextResponse.json({ template: updatedTemplate })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Update export template error:', error)
    return NextResponse.json({ message: '更新导出模板失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const templateId = parseInt(params.id)
    const template = await prisma.exportTemplate.findUnique({
      where: { id: templateId },
    })

    if (!template) {
      return NextResponse.json({ message: '模板不存在' }, { status: 404 })
    }

    if (template.isSystem) {
      return NextResponse.json({ message: '系统模板不能删除' }, { status: 403 })
    }

    if (template.createdBy !== user.id && user.role !== 'ADMIN') {
      return NextResponse.json({ message: '无权限删除此模板' }, { status: 403 })
    }

    await prisma.exportTemplate.delete({
      where: { id: templateId },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_EXPORT_TEMPLATE',
        module: 'EXPORT',
        tableId: template.tableId,
        detail: { templateId, name: template.name } as any,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete export template error:', error)
    return NextResponse.json({ message: '删除导出模板失败' }, { status: 500 })
  }
}
