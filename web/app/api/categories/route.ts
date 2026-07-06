import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const createCategorySchema = z.object({
  name: z.string().min(1, '分类名称不能为空'),
  parentId: z.number().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().optional().default(0),
})

function buildCategoryTree(categories: any[]): any[] {
  const map = new Map<number, any>()
  const roots: any[] = []

  categories.forEach(cat => {
    map.set(cat.id, { ...cat, children: [] })
  })

  categories.forEach(cat => {
    const node = map.get(cat.id)
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortByOrder = (nodes: any[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    nodes.forEach(node => sortByOrder(node.children))
  }
  sortByOrder(roots)

  return roots
}

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const categories = await prisma.tableCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        _count: {
          select: { tables: true, children: true },
        },
      },
    })

    const tree = buildCategoryTree(categories)

    return NextResponse.json({ categories, tree })
  } catch (error) {
    console.error('Get categories error:', error)
    return NextResponse.json({ message: '获取分类列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER')) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const data = createCategorySchema.parse(body)

    let level = 1
    if (data.parentId) {
      const parent = await prisma.tableCategory.findUnique({
        where: { id: data.parentId },
      })
      if (!parent) {
        return NextResponse.json({ message: '父分类不存在' }, { status: 400 })
      }
      if (parent.level >= 3) {
        return NextResponse.json({ message: '分类最多支持3级' }, { status: 400 })
      }
      level = parent.level + 1
    }

    const category = await prisma.tableCategory.create({
      data: {
        name: data.name,
        parentId: data.parentId || null,
        icon: data.icon || null,
        sortOrder: data.sortOrder,
        level,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_CATEGORY',
        module: 'CATEGORY',
        detail: { id: category.id, name: data.name, level },
      },
    })

    return NextResponse.json({ category })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Create category error:', error)
    return NextResponse.json({ message: '创建分类失败' }, { status: 500 })
  }
}
