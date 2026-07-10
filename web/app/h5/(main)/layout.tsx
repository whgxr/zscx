import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5BottomNav } from './bottom-nav'

export default async function H5MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/h5/login')
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'

  let tables: { id: number; name: string; label: string; icon?: string | null }[] = []

  if (isAdmin) {
    tables = await prisma.dataTable.findMany({
      where: { status: 'ACTIVE', isDetailTable: false },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, label: true, icon: true },
    })
  } else {
    const permissions = await prisma.tablePermission.findMany({
      where: { userId: user.id, canView: true },
      include: {
        table: {
          select: { id: true, name: true, label: true, icon: true, status: true, isDetailTable: true },
        },
      },
    })
    tables = permissions
      .filter(p => p.table.status === 'ACTIVE' && !p.table.isDetailTable)
      .map(p => p.table)
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <main className="flex-1 overflow-auto pb-20">
        {children}
      </main>
      <H5BottomNav user={user} isAdmin={isAdmin} />
    </div>
  )
}