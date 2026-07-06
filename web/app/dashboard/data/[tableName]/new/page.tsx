import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NewRecordClient } from './new-record-client'

export default async function NewRecordPage({
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

  const tableWithLayout = table ? {
    ...table,
    formLayoutConfig: (table as any).formLayoutConfig,
  } : null

  if (!tableWithLayout) {
    redirect('/dashboard')
  }

  return <NewRecordClient table={tableWithLayout} />
}
