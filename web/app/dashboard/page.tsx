import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DashboardClient } from './dashboard-client'

export default async function DashboardPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [
    tableCount,
    userCount,
    onlineUserCount,
    recordCount,
    todayNewCount,
    recentRecords,
    tableRecordStats,
    userConfig,
  ] = await Promise.all([
    prisma.dataTable.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.operationLog.groupBy({
      by: ['userId'],
      where: {
        createdAt: {
          gt: fiveMinutesAgo,
        },
        userId: {
          not: null,
        },
      },
      _count: {
        userId: true,
      },
    }).then(results => results.length),
    prisma.dataRecord.count(),
    prisma.dataRecord.count({
      where: {
        createdAt: {
          gte: todayStart,
        },
      },
    }),
    prisma.dataRecord.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { label: true } },
      },
    }),
    prisma.dataRecord.groupBy({
      by: ['tableId'],
      _count: {
        tableId: true,
      },
      orderBy: {
        _count: {
          tableId: 'desc',
        },
      },
      take: 10,
    }).then(async (stats) => {
      const tableIds = stats.map(s => s.tableId)
      const tables = await prisma.dataTable.findMany({
        where: { id: { in: tableIds } },
        select: { id: true, label: true },
      })
      const tableMap = new Map(tables.map(t => [t.id, t.label]))
      return stats.map(s => ({
        tableId: s.tableId,
        tableLabel: tableMap.get(s.tableId) || '未知项目',
        count: s._count.tableId,
      }))
    }),
    prisma.userDashboardConfig.findUnique({
      where: { userId: user.id },
    }),
  ])

  const initialData = {
    tableCount,
    userCount,
    onlineUserCount,
    recordCount,
    todayNewCount,
    recentRecords,
    tableRecordStats,
    userRole: user.role?.name || 'USER',
  }

  return (
    <DashboardClient
      initialData={initialData}
      initialConfig={userConfig?.config as any || null}
    />
  )
}
