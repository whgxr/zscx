import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import OfficeTemplateEditor from '@/components/office/office-template-editor'

export default async function WordTemplateDetailPage({
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
  if (tpl.type !== 'WORD') redirect('/dashboard/export-templates')

  const isAdmin = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER'
  if (!isAdmin && tpl.createdBy !== user.id) redirect('/dashboard/export-templates')

  return <OfficeTemplateEditor templateId={tpl.id} kind="word" title={tpl.name} />
}