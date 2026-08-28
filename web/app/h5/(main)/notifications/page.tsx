import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { notificationService } from '@/lib/notification-service'
import { H5NotificationsClient } from './notifications-client'

export default async function H5NotificationsPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/h5/login')

  const list = await notificationService.getNotifications(user.id, { page: 1, pageSize: 200, includeRead: true })
    .catch(() => [] as any[])

  const arr = Array.isArray(list) ? list : ((list as any)?.notifications ?? [])

  const notifications = arr.map((n: any) => {
    let link = n.linkUrl
    if (link && typeof link === 'string') {
      if (link.startsWith('/approval')) {
        link = '/h5/approval'
      } else if (link.startsWith('/dashboard/data/')) {
        const match = link.match(/^\/dashboard\/data\/([^/]+)\/([^/?#]+)/)
        if (match) link = `/h5/projects/${match[1]}/${match[2]}`
      } else if (link.startsWith('/dashboard/')) {
        link = '/h5/projects'
      }
    }
    return {
      ...n,
      id: n.id,
      type: n.type,
      title: n.title,
      content: n.content,
      read: !!n.readAt || !!n.isRead,
      link,
      metadata: n.linkParams,
      createdAt: n.createdAt,
    }
  })

  return <H5NotificationsClient userId={user.id} notifications={JSON.parse(JSON.stringify(notifications))} />
}

