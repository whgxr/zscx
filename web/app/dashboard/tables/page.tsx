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
  })

  const tableCounts = await prisma.dataTable.groupBy({
    by: ['categoryId'],
    _count: {
      id: true,
    },
    where: {
      isDetailTable: false,
    },
  })

  const categoryCountMap = new Map<number, number>()
  tableCounts.forEach(item => {
    if (item.categoryId !== null) {
      categoryCountMap.set(item.categoryId, item._count.id)
    }
  })

  const categoriesWithCount = categories.map(cat => ({
    ...cat,
    _count: {
      tables: categoryCountMap.get(cat.id) || 0,
    },
  }))

  return <TablesClient initialTables={tables} initialCategories={categoriesWithCount} userRole={user.role} />
}
