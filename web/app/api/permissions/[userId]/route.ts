import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { buildPermissionTree, USER_TABLE_OPS, USER_OP_TO_FIELD, USER_FIELD_TO_OP } from '@/lib/permission-tree'

const PERMISSION_FIELDS = [
  'canView',
  'canCreate',
  'canEdit',
  'canDelete',
  'canExportExcel',
  'canExportPdf',
  'canPrint',
  'canImport',
] as const

function tablePermissionFromRecord(perm: any) {
  return {
    canView: perm?.canView ?? false,
    canCreate: perm?.canCreate ?? false,
    canEdit: perm?.canEdit ?? false,
    canDelete: perm?.canDelete ?? false,
    canExportExcel: perm?.canExportExcel ?? false,
    canExportPdf: perm?.canExportPdf ?? false,
    canPrint: perm?.canPrint ?? false,
    canImport: perm?.canImport ?? false,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const userId = parseInt(params.userId)

    const tree = await buildPermissionTree(USER_TABLE_OPS)

    const tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      include: {
        permissions: {
          where: { userId },
        },
      },
    })

    const selectedIds: string[] = []
    const permissions = tables.map(table => {
      const perm = table.permissions[0]
      const p = tablePermissionFromRecord(perm)
      for (const field of PERMISSION_FIELDS) {
        const op = USER_FIELD_TO_OP[field]
        if (p[field] && op) selectedIds.push(`tableOp:${table.id}:${op}`)
      }
      return {
        tableId: table.id,
        tableName: table.name,
        tableLabel: table.label,
        ...p,
      }
    })

    return NextResponse.json({ tree, selectedIds, permissions })
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
    if (!currentUser || currentUser.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const userId = parseInt(params.userId)
    const body = await req.json()

    // 兼容两种提交格式：
    //   1) 树形：{ selectedIds: string[] }（tableOp:{tableId}:{OP}）
    //   2) 旧表格：{ permissions: [{ tableId, canView, ... }] }
    let selectedIds: string[] = []
    if (Array.isArray(body.selectedIds)) {
      selectedIds = body.selectedIds.filter((x: any) => typeof x === 'string')
    } else if (Array.isArray(body.permissions)) {
      for (const perm of body.permissions) {
        for (const field of PERMISSION_FIELDS) {
          const op = USER_FIELD_TO_OP[field]
          if (perm[field] && op) selectedIds.push(`tableOp:${perm.tableId}:${op}`)
        }
      }
    }

    // 按表聚合操作权限
    const byTable: Record<number, Record<string, boolean>> = {}
    for (const id of selectedIds) {
      const m = /^tableOp:(\d+):([A-Z_]+)$/.exec(id)
      if (!m) continue
      const tableId = Number(m[1])
      const field = USER_OP_TO_FIELD[m[2]]
      if (!field) continue
      byTable[tableId] = byTable[tableId] || {}
      byTable[tableId][field] = true
    }

    const tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    })

    for (const table of tables) {
      const fields = byTable[table.id] || {}
      const p = tablePermissionFromRecord(fields)
      const anyTrue = PERMISSION_FIELDS.some(f => p[f])

      const existing = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId, tableId: table.id } },
      })

      if (anyTrue) {
        if (existing) {
          await prisma.tablePermission.update({
            where: { id: existing.id },
            data: { ...p },
          })
        } else {
          await prisma.tablePermission.create({
            data: { userId, tableId: table.id, ...p },
          })
        }
      } else if (existing) {
        await prisma.tablePermission.delete({ where: { id: existing.id } })
      }
    }

    await prisma.operationLog.create({
      data: {
        userId: currentUser.id,
        action: 'UPDATE_PERMISSIONS',
        module: 'PERMISSION',
        detail: { userId, selectedCount: selectedIds.length },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update permissions error:', error)
    return NextResponse.json({ message: '更新权限失败' }, { status: 500 })
  }
}
