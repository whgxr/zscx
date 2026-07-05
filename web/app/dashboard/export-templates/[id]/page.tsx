import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { EmbeddedTemplateDesigner } from './embedded-designer'
import { TemplateDesigner } from './template-designer'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowLeft } from 'lucide-react'

export default async function TemplateDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
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

  if (template.format === 'EXCEL') {
    return <EmbeddedTemplateDesigner template={template as any} />
  }

  return <TemplateDesigner template={template as any} />
}
