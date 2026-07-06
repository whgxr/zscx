import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const updateCategorySchema = z.object({
  name: z.string().min(1, '分类名称不能为空').optional(),
  parentId: z.number().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
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

    const category = await prisma.tableCategory.findUnique({
      where: { id },
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { tables: true, children: true },
        },
      },
    })

    if (!category) {
      return NextResponse.json({ message: '分类不存在' }, { status: 404 })
    }

    return NextResponse.json({ category })
  } catch (error) {
    console.error('Get category error:', error)
    return NextResponse.json({ message: '获取分类失败' }, { status: 500 })
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
    const data = updateCategorySchema.parse(body)

    const existing = await prisma.tableCategory.findUnique({
      where: { id },
    })
    if (!existing) {
      return NextResponse.json({ message: '分类不存在' }, { status: 404 })
    }

    let updateData: any = { ...data }

    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      if (data.parentId === null) {
        updateData.level = 1
      } else {
        if (data.parentId === id) {
          return NextResponse.json({ message: '不能将自己设为父分类' }, { status: 400 })
        }

        const parent = await prisma.tableCategory.findUnique({
          where: { id: data.parentId },
        })
        if (!parent) {
          return NextResponse.json({ message: '父分类不存在' }, { status: 400 })
        }

        const newLevel = parent.level + 1
        if (newLevel > 3) {
          return NextResponse.json({ message: '分类最多支持3级' }, { status: 400 })
        }

        const getChildIds = async (catId: number): Promise<number[]> => {
          const children = await prisma.tableCategory.findMany({
            where: { parentId: catId },
            select: { id: true },
          })
          const ids = children.map(c => c.id)
          for (const childId of ids) {
            ids.push(...await getChildIds(childId))
          }
          return ids
        }

        const childIds = await getChildIds(id)
        if (childIds.includes(data.parentId)) {
          return NextResponse.json({ message: '不能将分类移动到其子分类下' }, { status: 400 })
        }

        updateData.level = newLevel
      }
    }

    const category = await prisma.tableCategory.update({
      where: { id },
      data: updateData,
    })

    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      const updateChildrenLevel = async (parentId: number, parentLevel: number) => {
        const children = await prisma.tableCategory.findMany({
          where: { parentId },
        })
        for (const child of children) {
          const newLevel = parentLevel + 1
          await prisma.tableCategory.update({
            where: { id: child.id },
            data: { level: newLevel },
          })
          await updateChildrenLevel(child.id, newLevel)
        }
      }
      await updateChildrenLevel(id, category.level)
    }

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_CATEGORY',
        module: 'CATEGORY',
        detail: { id, ...data },
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
    console.error('Update category error:', error)
    return NextResponse.json({ message: '更新分类失败' }, { status: 500 })
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

    const category = await prisma.tableCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { tables: true, children: true },
        },
      },
    })

    if (!category) {
      return NextResponse.json({ message: '分类不存在' }, { status: 404 })
    }

    if (category._count.children > 0) {
      return NextResponse.json(
        { message: '该分类下存在子分类，无法删除' },
        { status: 400 }
      )
    }

    if (category._count.tables > 0) {
      return NextResponse.json(
        { message: '该分类下存在项目，无法删除' },
        { status: 400 }
      )
    }

    await prisma.tableCategory.delete({ where: { id } })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_CATEGORY',
        module: 'CATEGORY',
        detail: { id, name: category.name },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete category error:', error)
    return NextResponse.json({ message: '删除分类失败' }, { status: 500 })
  }
}
