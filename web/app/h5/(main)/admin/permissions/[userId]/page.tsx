import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildPermissionTree, USER_TABLE_OPS, USER_FIELD_TO_OP } from '@/lib/permission-tree'
import { H5AdminPermissionsEditClient } from './permissions-edit-client'

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

export default async function H5AdminPermissionsEditPage({ params }: { params: { userId: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')
  if (user.role?.name !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">仅管理员可访问</div>
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: parseInt(params.userId) },
    select: { id: true, username: true, realName: true },
  })
  if (!targetUser) return <div className="p-8 text-center text-gray-500">用户不存在</div>

  const tree = await buildPermissionTree(USER_TABLE_OPS)

  const permissions = await prisma.tablePermission.findMany({
    where: { userId: targetUser.id },
  })

  const selectedIds: string[] = []
  for (const p of permissions) {
    for (const field of PERMISSION_FIELDS) {
      const op = (USER_FIELD_TO_OP as Record<string, string>)[field]
      if ((p as any)[field] && op) selectedIds.push(`tableOp:${p.tableId}:${op}`)
    }
  }

  return (
    <H5AdminPermissionsEditClient
      targetUser={JSON.parse(JSON.stringify(targetUser))}
      tree={JSON.parse(JSON.stringify(tree))}
      initialSelected={selectedIds}
    />
  )
}
