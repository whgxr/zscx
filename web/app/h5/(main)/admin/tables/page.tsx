import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminTablesClient } from './tables-client'

export default async function H5AdminTablesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')
  if (user.role?.name !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">仅管理员可访问</div>
  }

  const tables = await prisma.dataTable.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { records: true } } },
  })

  return <H5AdminTablesClient tables={JSON.parse(JSON.stringify(tables))} />
}