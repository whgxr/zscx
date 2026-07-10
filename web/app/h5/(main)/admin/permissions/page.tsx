import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminPermissionsClient } from './permissions-client'

export default async function H5AdminPermissionsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')
  if (user.role?.name !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">仅管理员可访问</div>
  }

  const tables = await prisma.dataTable.findMany({
    where: { isDetailTable: false, status: 'ACTIVE' },
    select: { id: true, name: true, label: true },
    orderBy: { sortOrder: 'asc' },
  })

  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, username: true, realName: true },
    orderBy: { createdAt: 'desc' },
  })

  return <H5AdminPermissionsClient tables={JSON.parse(JSON.stringify(tables))} users={JSON.parse(JSON.stringify(users))} />
}