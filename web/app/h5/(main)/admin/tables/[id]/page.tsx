import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminTableDetailClient } from './table-detail-client'

export default async function H5AdminTableDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')
  if (user.role?.name !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">仅超级管理员可访问</div>
  }

  const table = await prisma.dataTable.findUnique({
    where: { id: parseInt(params.id) },
    include: { fields: { orderBy: { sortOrder: 'asc' } }, _count: { select: { records: true } } },
  })

  if (!table) return <div className="p-8 text-center text-gray-500">数据表不存在</div>

  return <H5AdminTableDetailClient table={JSON.parse(JSON.stringify(table))} />
}