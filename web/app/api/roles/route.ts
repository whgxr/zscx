import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const roles = await prisma.role.findMany({
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ roles })
  } catch (error) {
    console.error('Get roles error:', error)
    return NextResponse.json({ message: '获取角色失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const { name, label, description, canManageTables, canManageUsers, canManagePermissions, canManageTemplates, canViewLogs, canManageSettings, sortOrder } = body

    if (!name || !label) {
      return NextResponse.json({ message: '角色名称和显示名称不能为空' }, { status: 400 })
    }

    const existing = await prisma.role.findUnique({ where: { name } })
    if (existing) {
      return NextResponse.json({ message: '角色名称已存在' }, { status: 400 })
    }

    const role = await prisma.role.create({
      data: {
        name,
        label,
        description,
        canManageTables: canManageTables || false,
        canManageUsers: canManageUsers || false,
        canManagePermissions: canManagePermissions || false,
        canManageTemplates: canManageTemplates || false,
        canViewLogs: canViewLogs || false,
        canManageSettings: canManageSettings || false,
        sortOrder: sortOrder || 0,
      },
    })

    return NextResponse.json({ role }, { status: 201 })
  } catch (error) {
    console.error('Create role error:', error)
    return NextResponse.json({ message: '创建角色失败' }, { status: 500 })
  }
}
