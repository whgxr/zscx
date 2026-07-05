import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const role = await prisma.role.findUnique({
      where: { id: parseInt(params.id) },
    })

    if (!role) {
      return NextResponse.json({ message: '角色不存在' }, { status: 404 })
    }

    return NextResponse.json({ role })
  } catch (error) {
    console.error('Get role error:', error)
    return NextResponse.json({ message: '获取角色失败' }, { status: 500 })
  }
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

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const role = await prisma.role.findUnique({
      where: { id: parseInt(params.id) },
    })

    if (!role) {
      return NextResponse.json({ message: '角色不存在' }, { status: 404 })
    }

    if (role.isSystem) {
      return NextResponse.json({ message: '系统角色不能修改' }, { status: 400 })
    }

    const body = await req.json()
    const { name, label, description, canManageTables, canManageUsers, canManagePermissions, canManageTemplates, canViewLogs, canManageSettings, sortOrder } = body

    if (name && name !== role.name) {
      const existing = await prisma.role.findUnique({ where: { name } })
      if (existing) {
        return NextResponse.json({ message: '角色名称已存在' }, { status: 400 })
      }
    }

    const updatedRole = await prisma.role.update({
      where: { id: parseInt(params.id) },
      data: {
        ...(name && { name }),
        ...(label && { label }),
        ...(description !== undefined && { description }),
        ...(canManageTables !== undefined && { canManageTables }),
        ...(canManageUsers !== undefined && { canManageUsers }),
        ...(canManagePermissions !== undefined && { canManagePermissions }),
        ...(canManageTemplates !== undefined && { canManageTemplates }),
        ...(canViewLogs !== undefined && { canViewLogs }),
        ...(canManageSettings !== undefined && { canManageSettings }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    })

    return NextResponse.json({ role: updatedRole })
  } catch (error) {
    console.error('Update role error:', error)
    return NextResponse.json({ message: '更新角色失败' }, { status: 500 })
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

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const role = await prisma.role.findUnique({
      where: { id: parseInt(params.id) },
    })

    if (!role) {
      return NextResponse.json({ message: '角色不存在' }, { status: 404 })
    }

    if (role.isSystem) {
      return NextResponse.json({ message: '系统角色不能删除' }, { status: 400 })
    }

    const userCount = await prisma.user.count({ where: { roleId: role.id } })
    if (userCount > 0) {
      return NextResponse.json({ message: '该角色下还有用户，不能删除' }, { status: 400 })
    }

    await prisma.role.delete({
      where: { id: parseInt(params.id) },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete role error:', error)
    return NextResponse.json({ message: '删除角色失败' }, { status: 500 })
  }
}