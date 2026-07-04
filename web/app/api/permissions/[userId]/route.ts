import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const userId = parseInt(params.userId)
    
    const tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: {
        permissions: {
          where: { userId },
        },
      },
    })

    const permissions = tables.map(table => {
      const perm = table.permissions[0]
      return {
        tableId: table.id,
        tableName: table.name,
        tableLabel: table.label,
        canView: perm?.canView ?? false,
        canCreate: perm?.canCreate ?? false,
        canEdit: perm?.canEdit ?? false,
        canDelete: perm?.canDelete ?? false,
        canExport: perm?.canExport ?? false,
      }
    })

    return NextResponse.json({ permissions })
  } catch (error) {
    console.error('Get permissions error:', error)
    return NextResponse.json({ message: '获取权限失败' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || currentUser.role !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const userId = parseInt(params.userId)
    const body = await req.json()
    const { permissions } = body

    for (const perm of permissions) {
      const existing = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId, tableId: perm.tableId } },
      })

      if (existing) {
        await prisma.tablePermission.update({
          where: { id: existing.id },
          data: {
            canView: perm.canView,
            canCreate: perm.canCreate,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            canExport: perm.canExport,
          },
        })
      } else if (perm.canView || perm.canCreate || perm.canEdit || perm.canDelete || perm.canExport) {
        await prisma.tablePermission.create({
          data: {
            userId,
            tableId: perm.tableId,
            canView: perm.canView,
            canCreate: perm.canCreate,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            canExport: perm.canExport,
          },
        })
      }
    }

    await prisma.operationLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_PERMISSIONS',
        module: 'PERMISSION',
        detail: { userId, permissions },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update permissions error:', error)
    return NextResponse.json({ message: '更新权限失败' }, { status: 500 })
  }
}
