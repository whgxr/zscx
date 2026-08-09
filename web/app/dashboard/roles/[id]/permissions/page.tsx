import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildPermissionTree } from '@/lib/permission-tree'
import { PermissionsClient } from './permissions-client'

export default async function RolePermissionsPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role?.name !== 'ADMIN' && !user.role?.canManagePermissions) redirect('/dashboard')

  const roleId = Number(params.id)
  const role = await prisma.role.findUnique({ where: { id: roleId } })
  if (!role) redirect('/dashboard/roles')

  const tree = await buildPermissionTree()
  const selectedIds: string[] = Array.isArray((role.permissions as any)) ? ((role.permissions as any) as string[]) : []

  return (
    <PermissionsClient
      role={{ id: role.id, name: role.name, label: role.label, description: role.description, isSystem: role.isSystem }}
      tree={tree as any}
      initialSelected={selectedIds}
    />
  )
}
