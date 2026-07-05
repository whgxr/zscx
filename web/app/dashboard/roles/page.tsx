import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RolesClient } from './roles-client'

export default async function RolesPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN') {
    redirect('/dashboard')
  }

  const roles = await prisma.role.findMany({
    orderBy: { sortOrder: 'asc' },
  })

  return <RolesClient roles={roles} />
}