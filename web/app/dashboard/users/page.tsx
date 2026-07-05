import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { UsersClient } from './users-client'

export default async function UsersPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
    redirect('/dashboard')
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      username: true,
      realName: true,
      phone: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  })

  return <UsersClient initialUsers={users} currentUserRole={user.role} />
}
