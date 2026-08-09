import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { buildPermissionTree, flattenNodeIds, computeCheckState } from '@/lib/permission-tree'

/**
 * GET /api/roles/[id]/permissions
 *   返回: tree (PermissionTreeNode[]), selectedIds (string[]), role info
 *   使用方式：页面渲染 PermissionTree 组件 + 已选集合
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })
    if (user.role?.name !== 'ADMIN' && !user.role?.canManagePermissions) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = Number(params.id)
    const role = await prisma.role.findUnique({ where: { id } })
    if (!role) return NextResponse.json({ message: '角色不存在' }, { status: 404 })

    const tree = await buildPermissionTree()
    const selectedIds: string[] = Array.isArray((role.permissions as any)) ? ((role.permissions as any) as string[]) : []

    return NextResponse.json({
      ok: true,
      data: {
        role: {
          id: role.id, name: role.name, label: role.label,
          description: role.description, isSystem: role.isSystem,
          permissions: selectedIds,
        },
        tree,
        selectedIds,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '获取失败' }, { status: 500 })
  }
}

/**
 * PUT /api/roles/[id]/permissions
 *   body: { selectedIds: string[] }
 *   直接覆盖 Role.permissions（扁平集合）；若系统角色则拒绝
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })
    if (user.role?.name !== 'ADMIN' && !user.role?.canManagePermissions) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = Number(params.id)
    const role = await prisma.role.findUnique({ where: { id } })
    if (!role) return NextResponse.json({ message: '角色不存在' }, { status: 404 })
    if (role.isSystem) return NextResponse.json({ message: '系统角色的权限不能在此修改' }, { status: 400 })

    const body = await req.json()
    const ids = Array.isArray(body.selectedIds) ? Array.from(new Set(body.selectedIds.filter((x: any) => typeof x === 'string'))) : []
    const updated = await prisma.role.update({
      where: { id },
      data: { permissions: ids as any, updatedAt: new Date() },
    })

    try {
      await prisma.operationLog.create({
        data: {
          userId: user.id, action: 'PERMISSION_TREE.UPDATE', module: 'PERMISSIONS',
          detail: { roleId: id, count: ids.length } as any,
          ipAddress: (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined) as any,
          userAgent: req.headers.get('user-agent') ?? undefined,
        }
      })
    } catch (_) { /* audit must not block */ }

    return NextResponse.json({ ok: true, data: { permissions: (updated.permissions as any) ?? [] } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '保存失败' }, { status: 500 })
  }
}
