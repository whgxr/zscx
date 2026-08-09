import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5DataListClient } from './data-list-client'

export default async function H5DataListPage({ params }: { params: { tableName: string } }) {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  const table = await prisma.dataTable.findUnique({
    where: { name: params.tableName },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!table) {
    return <div className="p-8 text-center text-gray-500">项目不存在</div>
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  let permission: any = null
  let canCreate = isAdmin
  let canView = isAdmin

  if (!isAdmin) {
    const perm = await prisma.tablePermission.findFirst({
      where: { userId: user.id, tableId: table.id },
    })
    permission = perm ?? null
    canView = !!perm?.canView
    canCreate = !!perm?.canCreate
    // M4 树形权限：再查 role.permissions 是否包含 tableOp:X:VIEW/table:X
    const rolePerms: string[] = (user.role as any)?.permissions ?? []
    if (rolePerms.length) {
      const s = new Set(rolePerms)
      canView = canView || s.has(`table:${table.id}`) || s.has(`tableOp:${table.id}:VIEW`)
      canCreate = canCreate || s.has(`tableOp:${table.id}:CREATE`)
    }
    if (!canView) {
      return <div className="p-8 text-center text-gray-500">无权限访问</div>
    }
  }

  return (
    <H5DataListClient
      table={JSON.parse(JSON.stringify(table))}
      user={JSON.parse(JSON.stringify(user))}
      isAdmin={isAdmin}
      permission={permission ? JSON.parse(JSON.stringify({ ...permission, canView, canCreate, canEdit: permission ? permission.canEdit && permission.canView : isAdmin })) : null}
    />
  )
}