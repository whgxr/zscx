import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { TabsProvider } from '@/components/layout/tabs-context'
import { TabPanes } from '@/components/layout/tabs-panes'
import { prisma } from '@/lib/prisma'

export default async function WorkspaceShell({
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
      where: { status: 'ACTIVE', isDetailTable: false },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        label: true,
        icon: true,
        category: { select: { id: true, name: true, module: true } },
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
            isDetailTable: true,
            category: { select: { id: true, name: true, module: true } },
          },
        },
      },
    })

    tables = permissions
      .filter(p => p.table.status === 'ACTIVE' && !p.table.isDetailTable)
      .map(p => p.table)
  }

  return (
    <TabsProvider>
      <div className="flex h-screen bg-gray-100">
        <Sidebar user={user} tables={tables} />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Header user={user} />
          <TabPanes>{children}</TabPanes>
        </div>
      </div>
    </TabsProvider>
  )
}
