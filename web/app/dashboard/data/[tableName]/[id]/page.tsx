import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RecordDetailClient } from './record-detail-client'

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: { tableName: string; id: string }
  searchParams: { mode?: string }
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

  const recordId = parseInt(params.id)
  const record = await prisma.dataRecord.findUnique({
    where: { id: recordId },
    include: {
      creator: { select: { id: true, realName: true, username: true } },
    },
  })

  if (!record || record.tableId !== tableWithLayout.id) {
    redirect(`/dashboard/data/${tableWithLayout.name}`)
  }

  return <RecordDetailClient table={tableWithLayout} record={record} initialEditMode={searchParams.mode === 'edit'} />
}
