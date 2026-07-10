import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminUsersClient } from './users-client'

export default async function H5AdminUsersPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')
  if (user.role?.name !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">仅管理员可访问</div>
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { role: true },
  })

  // 角色列表
  const roles = await prisma.role.findMany()

  return <H5AdminUsersClient users={JSON.parse(JSON.stringify(users))} roles={JSON.parse(JSON.stringify(roles))} />
}