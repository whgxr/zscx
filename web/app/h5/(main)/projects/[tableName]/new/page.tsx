import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5NewRecordClient } from './new-record-client'

export default async function H5NewRecordPage({
  params,
  searchParams,
}: {
  params: { tableName: string }
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

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  let canCreate = isAdmin
  if (!isAdmin) {
    const perm = await prisma.tablePermission.findFirst({
      where: { userId: user.id, tableId: table.id },
    })
    canCreate = !!perm?.canCreate
    // M4 树形权限
    const rolePerms: string[] = (user.role as any)?.permissions ?? []
    if (rolePerms.length) {
      canCreate = canCreate || new Set(rolePerms).has(`tableOp:${table.id}:CREATE`)
    }
    if (!canCreate) {
      return <div className="p-8 text-center text-gray-500">无权限新增</div>
    }
  }

  // module：优先取 URL 参数，其次按表的分类模块推导（survey/levy）
  const module =
    searchParams?.module ||
    (table.category?.module === 'SURVEY' ? 'survey' : table.category?.module === 'LEVY' ? 'levy' : '') ||
    ''

  return (
    <H5NewRecordClient
      table={JSON.parse(JSON.stringify(table))}
      module={module}
    />
  )
}