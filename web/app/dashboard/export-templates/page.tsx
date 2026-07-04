import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExportTemplatesClient } from './export-templates-client'

export default async function ExportTemplatesPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    redirect('/dashboard')
  }

  const templates = await prisma.exportTemplate.findMany({
    orderBy: [
      { isSystem: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      table: {
        select: {
          id: true,
          name: true,
          label: true,
        },
      },
      sharedTables: {
        select: {
          id: true,
          name: true,
          label: true,
        },
      },
    },
  })

  const tables = await prisma.dataTable.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { sortOrder: 'asc' },
    include: {
      fields: {
        orderBy: { sortOrder: 'asc' },
      },
    },
  })

  return <ExportTemplatesClient initialTemplates={templates as any} tables={tables as any} />
}
