import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser, hashPassword } from '@/lib/auth'
import { z } from 'zod'
import { UserStatus } from '@prisma/client'

const createUserSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  password: z.string().min(6, '密码至少6个字符'),
  realName: z.string().min(1, '真实姓名不能为空'),
  phone: z.string().nullable().optional(),
  email: z.string().email('邮箱格式不正确').nullable().optional(),
  roleName: z.string().default('USER'),
})

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }
    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const keyword = searchParams.get('keyword') || ''

    const where: any = {}
    if (keyword) {
      where.OR = [
        { username: { contains: keyword } },
        { realName: { contains: keyword } },
        { phone: { contains: keyword } },
      ]
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({ users, total, page, pageSize })
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json({ message: '获取用户列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const data = createUserSchema.parse(body)

    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    })

    if (existing) {
      return NextResponse.json({ message: '用户名已存在' }, { status: 400 })
    }

    const role = await prisma.role.findUnique({ where: { name: data.roleName } })
    if (!role) {
      return NextResponse.json({ message: '角色不存在' }, { status: 400 })
    }

    const passwordHash = await hashPassword(data.password)

    const user = await prisma.user.create({
      data: {
        username: data.username,
        passwordHash,
        realName: data.realName,
        phone: data.phone,
        email: data.email,
        roleId: role.id,
        createdBy: currentUser.id,
      },
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
        action: 'CREATE_USER',
        module: 'USER',
        detail: { username: data.username, realName: data.realName, role: data.roleName },
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
    console.error('Create user error:', error)
    return NextResponse.json({ message: '创建用户失败' }, { status: 500 })
  }
}

