import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TemplateDesigner } from './template-designer'

export default async function TemplateDesignerPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
    redirect('/dashboard')
  }

  const template = await prisma.exportTemplate.findUnique({
    where: { id: parseInt(params.id) },
    include: {
      table: {
        include: {
          fields: {
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
  })

  if (!template) {
    redirect('/dashboard/export-templates')
  }

  return <TemplateDesigner template={template as any} />
}
