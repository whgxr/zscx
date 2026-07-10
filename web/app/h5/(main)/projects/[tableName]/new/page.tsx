import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5NewRecordClient } from './new-record-client'

export default async function H5NewRecordPage({ params }: { params: { tableName: string } }) {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  const table = await prisma.dataTable.findUnique({
    where: { name: params.tableName },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  })

  if (!table) {
    return <div className="p-8 text-center text-gray-500">项目不存在</div>
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  if (!isAdmin) {
    const perm = await prisma.tablePermission.findFirst({
      where: { userId: user.id, tableId: table.id },
    })
    if (!perm || !perm.canCreate) {
      return <div className="p-8 text-center text-gray-500">无权限新增</div>
    }
  }

  return (
    <H5NewRecordClient
      table={JSON.parse(JSON.stringify(table))}
    />
  )
}