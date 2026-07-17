import { NotificationsClient } from './notifications-client'
import { getCurrentUser } from '@/lib/auth'

export default async function NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) {
    return null
  }

  return <NotificationsClient user={user} />
}