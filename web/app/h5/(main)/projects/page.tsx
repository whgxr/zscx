import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ProjectsClient } from './projects-client'

export default async function H5ProjectsPage() {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'

  let tables: { id: number; name: string; label: string; icon?: string | null; description?: string | null }[] = []

  if (isAdmin) {
    tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE', isDetailTable: false },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, label: true, icon: true, description: true },
    })
  } else {
    const permissions = await prisma.tablePermission.findMany({
      where: { userId: user.id, canView: true },
      include: {
        table: {
          select: { id: true, name: true, label: true, icon: true, status: true, isDetailTable: true, description: true },
        },
      },
    })
    tables = permissions
      .filter(p => p.table.status === 'ACTIVE' && !p.table.isDetailTable)
      .map(p => p.table)
  }

  // 获取每个表的记录数
  const tableIds = tables.map(t => t.id)
  const recordCounts = await prisma.dataRecord.groupBy({
    by: ['tableId'],
    where: { tableId: { in: tableIds } },
    _count: { id: true },
  })
  const countMap: Record<number, number> = {}
  recordCounts.forEach(r => { countMap[r.tableId] = r._count.id })

  return (
    <ProjectsClient
      user={user}
      tables={tables}
      recordCounts={countMap}
      isAdmin={isAdmin}
    />
  )
}