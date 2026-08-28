import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RecordDetailClient } from './record-detail-client'

export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: { tableName: string; id: string }
  searchParams: { mode?: string; module?: string }
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
      category: { select: { module: true } },
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

  // module：优先取 URL 参数，其次按表的分类模块推导（survey/levy），保证详情/编辑页只读逻辑生效
  const module =
    searchParams?.module ||
    (tableWithLayout.category?.module === 'SURVEY' ? 'survey' : tableWithLayout.category?.module === 'LEVY' ? 'levy' : '') ||
    ''

  return <RecordDetailClient table={tableWithLayout} record={record} initialEditMode={searchParams.mode === 'edit'} module={module} userRole={user.role?.name} />
}
