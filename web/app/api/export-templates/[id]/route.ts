import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { ExportType } from '@prisma/client'

const updateTemplateSchema = z.object({
  name: z.string().min(1, '模板名称不能为空').optional(),
  type: z.nativeEnum(ExportType).optional(),
  category: z.union([z.string(), z.array(z.string())]).optional(),
  description: z.string().optional().nullable(),
  config: z.record(z.any()).optional(),
  isDefault: z.boolean().optional(),
  isShared: z.boolean().optional(),
  sharedTableIds: z.array(z.number()).optional(),
})

// 将分类值标准化为逗号分隔的字符串
function normalizeCategory(category: string | string[] | undefined): string | undefined {
  if (!category) return undefined
  if (Array.isArray(category)) {
    return category.filter(Boolean).join(',')
  }
  return String(category)
}

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

    // 系统模板：管理员和创建者可以修改，其他用户不能修改
    if (template.isSystem && user.role?.name !== 'ADMIN' && template.createdBy !== user.id) {
      return NextResponse.json({ message: '系统模板只有管理员或创建者可以修改' }, { status: 403 })
    }

    // 非系统模板：只有创建者和管理员可以修改
    if (!template.isSystem && template.createdBy !== user.id && user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限修改此模板' }, { status: 403 })
    }

    const body = await req.json()
    const data = updateTemplateSchema.parse(body)

    if (data.isDefault) {
      await prisma.exportTemplate.updateMany({
        where: {
          tableId: template.tableId,
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
        ...(data.type !== undefined && { type: data.type }),
        ...(data.category !== undefined && { category: normalizeCategory(data.category) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.config !== undefined && { config: data.config as any }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
        ...(data.isShared !== undefined && { isShared: data.isShared }),
        ...(data.sharedTableIds !== undefined && {
          sharedTables: {
            set: data.sharedTableIds.map(id => ({ id })),
          },
        }),
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

    // 系统模板：管理员和创建者可以删除，其他用户不能删除
    if (template.isSystem && user.role?.name !== 'ADMIN' && template.createdBy !== user.id) {
      return NextResponse.json({ message: '系统模板只有管理员或创建者可以删除' }, { status: 403 })
    }

    // 非系统模板：只有创建者和管理员可以删除
    if (!template.isSystem && template.createdBy !== user.id && user.role?.name !== 'ADMIN') {
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
