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

  if (!table) {
    redirect('/dashboard')
  }

  return <NewRecordClient table={table} />
}
