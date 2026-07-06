import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'

  let tables

  if (isAdmin) {
    tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        label: true,
        icon: true,
      },
    })
  } else {
    const permissions = await prisma.tablePermission.findMany({
      where: {
        userId: user.id,
        canView: true,
      },
      include: {
        table: {
          select: {
            id: true,
            name: true,
            label: true,
            icon: true,
            status: true,
          },
        },
      },
    })

    tables = permissions
      .filter(p => p.table.status === 'ACTIVE')
      .map(p => p.table)
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar user={user} tables={tables} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
