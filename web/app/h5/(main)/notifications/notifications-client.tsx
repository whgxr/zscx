"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Bell, CheckCheck, FileSignature, Clock } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface Notif {
  id: number
  type: string
  title: string
  content: string
  read: boolean
  link?: string | null
  metadata?: any
  createdAt: string | Date
}

export function H5NotificationsClient({ userId, notifications }: { userId: number; notifications: Notif[] }) {
  const router = useRouter()
  const [items, setItems] = useState<Notif[]>(notifications)
  const [acting, setActing] = useState(false)

  const markAllRead = async () => {
    setActing(true)
    try {
      const res = await fetch('/api/notification/read-all', { method: 'POST' })
      if (res.ok) {
        setItems(items.map(n => ({ ...n, read: true })))
      }
    } finally { setActing(false) }
  }

  const openItem = async (n: Notif) => {
    if (!n.read) {
      try {
        await fetch(`/api/notification/${n.id}?action=read`, { method: 'POST' }).catch(() => {})
        setItems(items.map(x => x.id === n.id ? { ...x, read: true } : x))
      } catch {}
    }
    if (n.link) router.push(n.link)
  }

  const unread = items.filter(n => !n.read).length

  return (
    <div className="flex flex-col min-h-screen">
      {/* 顶部 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/projects')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">通知中心</h1>
            <p className="text-xs text-gray-500">共 {items.length} 条，{unread} 条未读</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={markAllRead} disabled={acting || !unread}>
            <CheckCheck className="w-4 h-4 mr-1" /> 全部已读
          </Button>
        </div>
      </div>

      <div className="flex-1 px-4 py-3 space-y-2">
        {items.length === 0 && (
          <div className="text-center py-20">
            <Bell className="w-12 h-12 mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500">暂无通知</p>
          </div>
        )}
        {items.map(n => {
          const isDoc = n.type === 'DOCUMENT'
          return (
            <Card
              key={n.id}
              className={'shadow-sm border-0 cursor-pointer active:scale-[0.995] transition-transform' + (n.read ? ' opacity-70' : '')}
              onClick={() => openItem(n)}
            >
              <div className="p-3.5 flex items-start gap-3">
                <div className={'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ' + (
                  isDoc ? 'bg-emerald-50 text-emerald-600'
                  : n.type?.includes('APPROVAL') ? 'bg-indigo-50 text-indigo-600'
                  : 'bg-blue-50 text-blue-600'
                )}>
                  {isDoc ? <FileSignature className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={'text-sm line-clamp-1 ' + (n.read ? 'font-medium text-gray-700' : 'font-semibold text-gray-900')}>
                      {!n.read && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle"></span>}
                      {n.title}
                    </h3>
                    <Badge variant="outline" className="text-[10px] shrink-0">{n.type}</Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.content}</p>
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                    <Clock className="w-3 h-3" />{formatDateTime(n.createdAt)}
                    {n.metadata?.jobId && <span className="ml-2">jobId: {n.metadata.jobId}</span>}
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
