import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { H5ProfileClient } from './profile-client'

export default async function H5ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  // 获取完整用户信息
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { role: true },
  })

  // 获取用户操作统计
  const [recordCount, attachmentCount] = await Promise.all([
    prisma.dataRecord.count({ where: { createdBy: user.id } }),
    prisma.recordAttachment.count({ where: { uploadedBy: user.id } }),
  ])

  return (
    <H5ProfileClient
      user={JSON.parse(JSON.stringify(fullUser))}
      stats={{ records: recordCount, attachments: attachmentCount }}
    />
  )
}