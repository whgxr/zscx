import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DataListClient } from './data-list-client'

export default async function DataListPage({
  params,
}: {
  params: { tableName: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const table = await prisma.dataTable.findUnique({
    where: { name: params.tableName },
    include: {
      fields: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  if (!table) {
    redirect('/dashboard')
  }

  let permission: any = null
  if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
    permission = await prisma.tablePermission.findUnique({
      where: { userId_tableId: { userId: user.id, tableId: table.id } },
    })
    if (!permission || !permission.canView) {
      redirect('/dashboard')
    }
  }

  return <DataListClient table={table} user={user} permission={permission} />
}
