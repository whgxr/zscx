import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExcelTemplateDesigner } from './excel-designer'
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

  const config = template.config as any
  const isExcelTemplate = template.format === 'EXCEL' && config?.type === 'EXCEL_TEMPLATE'

  if (template.format === 'EXCEL') {
    return <ExcelTemplateDesigner template={template as any} />
  }

  return <TemplateDesigner template={template as any} />
}
