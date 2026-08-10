import IntegrationsPage from './integrations-client'
import { getCurrentUser } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const metadata = {
  title: '集成管理',
  description: '第三方平台集成配置',
}

export default async function IntegrationsRoutePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <IntegrationsPage />
}