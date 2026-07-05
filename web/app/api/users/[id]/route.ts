import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword } from '@/lib/auth'
import { z } from 'zod'

const updateUserSchema = z.object({
  realName: z.string().min(1, '真实姓名不能为空').optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('邮箱格式不正确').nullable().optional(),
  roleName: z.string().optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  password: z.string().min(6, '密码至少6个字符').optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }
    if (currentUser.role?.name !== 'ADMIN' && currentUser.role?.name !== 'MANAGER') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ message: '用户不存在' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json({ message: '获取用户失败' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    const body = await req.json()
    const data = updateUserSchema.parse(body)

    const updateData: any = {}
    if (data.realName !== undefined) updateData.realName = data.realName
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.email !== undefined) updateData.email = data.email
    if (data.roleName) {
      const role = await prisma.role.findUnique({ where: { name: data.roleName } })
      if (role) {
        updateData.roleId = role.id
      }
    }
    if (data.status) updateData.status = data.status
    if (data.password) updateData.passwordHash = await hashPassword(data.password)

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        realName: true,
        role: true,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_USER',
        module: 'USER',
        detail: { userId: id, ...updateData },
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Update user error:', error)
    return NextResponse.json({ message: '更新用户失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    
    if (id === currentUser.id) {
      return NextResponse.json({ message: '不能删除自己' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id }, include: { role: true } })
    if (!user) {
      return NextResponse.json({ message: '用户不存在' }, { status: 404 })
    }

    if (user.role?.name === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: { name: 'ADMIN' } } })
      if (adminCount <= 1) {
        return NextResponse.json({ message: '至少保留一个管理员' }, { status: 400 })
      }
    }

    await prisma.tablePermission.deleteMany({ where: { userId: id } })
    await prisma.user.delete({ where: { id } })

    await prisma.operationLog.create({
      data: {
        userId: currentUser.id,
        action: 'DELETE_USER',
        module: 'USER',
        detail: { userId: id, username: user.username },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete user error:', error)
    return NextResponse.json({ message: '删除用户失败' }, { status: 500 })
  }
}
