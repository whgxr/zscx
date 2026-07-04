import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PermissionManager } from './permission-manager'

export default async function PermissionsPage({
  params,
}: {
  params: { userId: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard')
  }

  const targetUserId = parseInt(params.userId)
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, username: true, realName: true, role: true },
  })

  if (!targetUser) {
    redirect('/dashboard/users')
  }

  const tables = await prisma.dataTable.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
    include: {
      permissions: {
        where: { userId: targetUserId },
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

  return (
    <PermissionManager
      targetUser={targetUser}
      initialPermissions={permissions}
    />
  )
}
