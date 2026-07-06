import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { ExportType, TemplateCategory } from '@prisma/client'

const createTemplateSchema = z.object({
  tableId: z.number(),
  name: z.string().min(1, '模板名称不能为空'),
  type: z.nativeEnum(ExportType),
  category: z.nativeEnum(TemplateCategory).optional(),
  description: z.string().optional().nullable(),
  config: z.record(z.any()),
  isDefault: z.boolean().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId')
    const category = searchParams.get('category')

    const where: any = {
      OR: [
        { isSystem: true },
        { createdBy: user.id },
      ],
    }

    if (tableId) {
      where.OR = [
        { ...where.OR[0], tableId: parseInt(tableId) },
        { ...where.OR[1], tableId: parseInt(tableId) },
        {
          isShared: true,
          sharedTables: {
            some: {
              id: parseInt(tableId),
            },
          },
        },
      ]
    }

    if (category) {
      where.category = category as TemplateCategory
    }

    const templates = await prisma.exportTemplate.findMany({
      where,
      include: {
        table: {
          select: {
            id: true,
            name: true,
            label: true,
          },
        },
      },
      orderBy: [
        { isSystem: 'desc' },
        { isDefault: 'desc' },
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json({ templates })
  } catch (error) {
    console.error('Get export templates error:', error)
    return NextResponse.json({ message: '获取导出模板失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const data = createTemplateSchema.parse(body)

    if (data.isDefault) {
      await prisma.exportTemplate.updateMany({
        where: {
          tableId: data.tableId,
          category: data.category || 'EXPORT',
          createdBy: user.id,
          isDefault: true,
        },
        data: { isDefault: false },
      })
    }

    const template = await prisma.exportTemplate.create({
      data: {
        tableId: data.tableId,
        name: data.name,
        type: data.type,
        category: data.category || 'EXPORT',
        description: data.description || null,
        config: data.config as any,
        isDefault: data.isDefault || false,
        createdBy: user.id,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_EXPORT_TEMPLATE',
        module: 'EXPORT',
        tableId: data.tableId,
        detail: { templateId: template.id, name: data.name } as any,
      },
    })

    return NextResponse.json({ template })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Create export template error:', error)
    return NextResponse.json({ message: '创建导出模板失败' }, { status: 500 })
  }
}
