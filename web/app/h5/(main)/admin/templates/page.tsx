import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5AdminTemplatesClient } from './templates-client'

export default async function H5AdminTemplatesPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')
  if (user.role?.name !== 'ADMIN') {
    return <div className="p-8 text-center text-gray-500">仅管理员可访问</div>
  }

  const templates = await prisma.exportTemplate.findMany({
    include: {
      table: { select: { label: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })

  return <H5AdminTemplatesClient templates={JSON.parse(JSON.stringify(templates))} />
}