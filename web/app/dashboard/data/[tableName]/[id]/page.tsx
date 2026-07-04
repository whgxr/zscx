import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RecordDetailClient } from './record-detail-client'

export default async function RecordDetailPage({
  params,
}: {
  params: { tableName: string; id: string }
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

  const recordId = parseInt(params.id)
  const record = await prisma.dataRecord.findUnique({
    where: { id: recordId },
    include: {
      creator: { select: { id: true, realName: true, username: true } },
    },
  })

  if (!record || record.tableId !== table.id) {
    redirect(`/dashboard/data/${table.name}`)
  }

  return <RecordDetailClient table={table} record={record} />
}
