import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TablesClient } from './tables-client'

export default async function TablesPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
    redirect('/dashboard')
  }

  const tables = await prisma.dataTable.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      category: true,
      _count: {
        select: { fields: true, records: true },
      },
    },
  })

  const categories = await prisma.tableCategory.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { tables: true },
      },
    },
  })

  return <TablesClient initialTables={tables} initialCategories={categories} userRole={user.role} />
}
