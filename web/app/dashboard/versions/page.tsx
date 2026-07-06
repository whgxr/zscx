import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { VersionsClient } from './versions-client'

export default async function VersionsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const feishuSettings = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: ['feishu_webhook_url', 'feishu_enabled'],
      },
    },
  })

  const feishuConfig: Record<string, string> = {}
  feishuSettings.forEach(s => {
    feishuConfig[s.key] = s.value
  })

  return (
    <VersionsClient
      userRole={user.role}
      feishuEnabled={feishuConfig['feishu_enabled'] === 'true'}
      feishuConfigured={!!feishuConfig['feishu_webhook_url']}
    />
  )
}
