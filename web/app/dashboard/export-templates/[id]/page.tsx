import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ExcelTemplateDesigner } from './excel-designer'

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

  // v1.2.2+: WORD 类型模板走专用 Word 设计器
  if (template.type === 'WORD') {
    redirect(`/dashboard/word-templates/${template.id}`)
  }

  return <ExcelTemplateDesigner template={template as any} />
}
