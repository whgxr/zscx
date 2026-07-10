import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5RecordDetailClient } from './record-detail-client'

export default async function H5RecordDetailPage({ params }: { params: { tableName: string; recordId: string } }) {
  const user = await getCurrentUser()
  if (!user) { redirect('/h5/login') }

  const table = await prisma.dataTable.findUnique({
    where: { name: params.tableName },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
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

  if (!record) {
    return <div className="p-8 text-center text-gray-500">记录不存在</div>
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  let canEdit = isAdmin

  if (!isAdmin) {
    const perm = await prisma.tablePermission.findFirst({
      where: { userId: user.id, tableId: table.id },
    })
    if (!perm || !perm.canView) {
      return <div className="p-8 text-center text-gray-500">无权限访问</div>
    }
    canEdit = perm.canEdit
  }

  return (
    <H5RecordDetailClient
      table={JSON.parse(JSON.stringify(table))}
      record={JSON.parse(JSON.stringify(record))}
      canEdit={canEdit}
    />
  )
}