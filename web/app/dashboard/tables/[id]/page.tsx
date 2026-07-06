import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FieldDesigner } from './field-designer'

export default async function TableDesignerPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
    redirect('/dashboard')
  }

  const tableId = parseInt(params.id)
  if (isNaN(tableId)) {
    redirect('/dashboard/tables')
  }

  const table = await prisma.dataTable.findUnique({
    where: { id: tableId },
    include: {
      fields: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  const tableWithConfig = table ? {
    ...table,
    formLayoutConfig: (table as any).formLayoutConfig,
  } : null

  if (!tableWithConfig) {
    redirect('/dashboard/tables')
  }

  return <FieldDesigner table={tableWithConfig} userRole={user.role} />
}
