import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const createTableSchema = z.object({
  name: z.string().min(1, '表名不能为空').regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '表名只能包含字母、数字和下划线，且以字母开头'),
  label: z.string().min(1, '显示名称不能为空'),
  description: z.string().optional(),
  icon: z.string().optional(),
  categoryId: z.number().nullable().optional(),
  sortOrder: z.number().optional().default(0),
})

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const categoryId = searchParams.get('categoryId')
    const uncategorized = searchParams.get('uncategorized')

    const where: any = {}
    if (status) where.status = status

    if (uncategorized === 'true') {
      where.categoryId = null
    } else if (categoryId) {
      const catId = parseInt(categoryId)
      if (!isNaN(catId)) {
        where.categoryId = catId
      }
    }

    const tables = await prisma.dataTable.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        category: true,
        _count: {
          select: { fields: true, records: true },
        },
      },
    })

    return NextResponse.json({ tables })
  } catch (error) {
    console.error('Get tables error:', error)
    return NextResponse.json({ message: '获取数据表列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const data = createTableSchema.parse(body)

    const existing = await prisma.dataTable.findUnique({
      where: { name: data.name },
    })

    if (existing) {
      return NextResponse.json({ message: '表名已存在' }, { status: 400 })
    }

    const table = await prisma.dataTable.create({
      data: {
        ...data,
        createdBy: user.id,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_TABLE',
        module: 'TABLE',
        tableId: table.id,
        detail: { name: data.name, label: data.label },
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
    console.error('Create table error:', error)
    return NextResponse.json({ message: '创建数据表失败' }, { status: 500 })
  }
}

