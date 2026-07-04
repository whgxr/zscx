import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TablesClient } from './tables-client'

export default async function TablesPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    redirect('/dashboard')
  }

  const tables = await prisma.dataTable.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      _count: {
        select: { fields: true, records: true },
      },
    },
  })

  return <TablesClient initialTables={tables} userRole={user.role} />
}
