import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminPermissionsEditClient } from './permissions-edit-client'

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

  const tables = await prisma.dataTable.findMany({
    where: { isDetailTable: false, status: 'ACTIVE' },
    select: { id: true, name: true, label: true },
    orderBy: { sortOrder: 'asc' },
  })

  const permissions = await prisma.tablePermission.findMany({
    where: { userId: targetUser.id },
  })
  const permMap: Record<number, any> = {}
  permissions.forEach(p => { permMap[p.tableId] = p })

  return (
    <H5AdminPermissionsEditClient
      targetUser={JSON.parse(JSON.stringify(targetUser))}
      tables={JSON.parse(JSON.stringify(tables))}
      permMap={JSON.parse(JSON.stringify(permMap))}
    />
  )
}