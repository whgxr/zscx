import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminUsersClient } from './users-client'

export default async function H5AdminUsersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  const currentUserRole = user.role?.name
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'MANAGER') {
    return <div className="p-8 text-center text-gray-500">仅管理员可访问</div>
  }

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { status: 'ACTIVE' },
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.role.findMany({ orderBy: { name: 'asc' } }),
  ])

  return <H5AdminUsersClient users={JSON.parse(JSON.stringify(users))} roles={JSON.parse(JSON.stringify(roles))} />
}