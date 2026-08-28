import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OfficeTemplateEditor from '@/components/office/office-template-editor'

export default async function TemplateDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const id = parseInt(params.id)
  const tpl = await prisma.exportTemplate.findUnique({
    where: { id },
    include: { table: { include: { fields: { orderBy: { id: 'asc' } } } } },
  })
  if (!tpl) redirect('/dashboard/export-templates')

  // WORD 类型走专用 Word 设计器（同为 ONLYOFFICE，但按 type 区分入口）
  if (tpl.type === 'WORD') {
    redirect(`/dashboard/word-templates/${tpl.id}`)
  }

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  if (!isAdmin && tpl.createdBy !== user.id) redirect('/dashboard/export-templates')

  return <OfficeTemplateEditor templateId={tpl.id} kind="cell" title={tpl.name} />
}