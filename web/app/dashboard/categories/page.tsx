import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CategoriesClient } from './categories-client'

export default async function CategoriesPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
    redirect('/dashboard')
  }

  const categories = await prisma.tableCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { tables: true, children: true },
      },
    },
  })

  return <CategoriesClient initialCategories={categories} userRole={user.role} />
}
