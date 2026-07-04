import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword, comparePassword } from '@/lib/auth'
import { z } from 'zod'

const updateProfileSchema = z.object({
  realName: z.string().min(1, '真实姓名不能为空').optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email('邮箱格式不正确').nullable().optional(),
})

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, '旧密码不能为空'),
  newPassword: z.string().min(6, '新密码至少6个字符'),
})

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return NextResponse.json({ user: userData })
  } catch (error) {
    console.error('Get profile error:', error)
    return NextResponse.json({ message: '获取个人资料失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const data = updateProfileSchema.parse(body)

    const updateData: any = {}
    if (data.realName !== undefined) updateData.realName = data.realName
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.email !== undefined) updateData.email = data.email

    const user = await prisma.user.update({
      where: { id: currentUser.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        realName: true,
        phone: true,
        email: true,
        role: true,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_PROFILE',
        module: 'USER',
        detail: updateData as any,
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
    console.error('Update profile error:', error)
    return NextResponse.json({ message: '更新个人资料失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const { oldPassword, newPassword } = changePasswordSchema.parse(body)

    const user = await prisma.user.findUnique({
      where: { id: currentUser.id },
    })

    if (!user) {
      return NextResponse.json({ message: '用户不存在' }, { status: 404 })
    }

    const valid = await comparePassword(oldPassword, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ message: '旧密码不正确' }, { status: 400 })
    }

    await prisma.user.update({
      where: { id: currentUser.id },
      data: { passwordHash: await hashPassword(newPassword) },
    })

    await prisma.operationLog.create({
      data: {
        userId: currentUser.id,
        action: 'CHANGE_PASSWORD',
        module: 'USER',
        detail: { userId: currentUser.id },
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
    console.error('Change password error:', error)
    return NextResponse.json({ message: '修改密码失败' }, { status: 500 })
  }
}
