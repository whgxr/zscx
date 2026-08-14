import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5RecordDetailClient } from './record-detail-client'

export default async function H5RecordDetailPage({
  params,
  searchParams,
}: {
  params: { tableName: string; recordId: string }
  searchParams: { module?: string }
}) {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  const table = await prisma.dataTable.findUnique({
    where: { name: params.tableName },
    include: {
      fields: { orderBy: { sortOrder: 'asc' } },
      category: { select: { module: true } },
    },
  })

  if (!table) {
    return <div className="p-8 text-center text-gray-500">项目不存在</div>
  }

  const recordId = parseInt(params.recordId)
  const record = await prisma.dataRecord.findUnique({
    where: { id: recordId },
    include: {
      creator: { select: { id: true, username: true, realName: true } },
      attachments: {
        orderBy: { createdAt: 'desc' },
        include: {
          uploader: { select: { id: true, username: true, realName: true } },
        },
      },
    },
  })

  if (!record || record.tableId !== table.id) {
    return <div className="p-8 text-center text-gray-500">记录不存在</div>
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  let canEdit = isAdmin
  let canView = isAdmin

  if (!isAdmin) {
    const perm = await prisma.tablePermission.findFirst({
      where: { userId: user.id, tableId: table.id },
    })
    canView = !!perm?.canView
    canEdit = !!perm?.canEdit
    // M4 树形权限：再查 role.permissions
    const rolePerms: string[] = (user.role as any)?.permissions ?? []
    if (rolePerms.length) {
      const s = new Set(rolePerms)
      canView = canView || s.has(`table:${table.id}`) || s.has(`tableOp:${table.id}:VIEW`)
      canEdit = canEdit || s.has(`tableOp:${table.id}:UPDATE`)
    }
    if (!canView) {
      return <div className="p-8 text-center text-gray-500">无权限访问</div>
    }
  }

  // module：优先取 URL 参数，其次按表的分类模块推导（survey/levy）
  const module =
    searchParams?.module ||
    (table.category?.module === 'SURVEY' ? 'survey' : table.category?.module === 'LEVY' ? 'levy' : '') ||
    ''

  return (
    <H5RecordDetailClient
      table={JSON.parse(JSON.stringify(table))}
      record={JSON.parse(JSON.stringify(record))}
      canEdit={canEdit}
      module={module}
    />
  )
}