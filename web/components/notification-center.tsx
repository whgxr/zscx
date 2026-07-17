"use client"

import { useState, useEffect } from 'react'
import { Bell, X, Check, AlertCircle, FileText, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Notification } from '@prisma/client'

interface NotificationCenterProps {
  onNavigate?: (url: string) => void
}

const typeIcons: Record<string, React.ReactNode> = {
  SYSTEM: <AlertCircle className="w-4 h-4 text-blue-500" />,
  BUSINESS: <FileText className="w-4 h-4 text-green-500" />,
  APPROVAL: <MessageSquare className="w-4 h-4 text-yellow-500" />,
  ALERT: <Bell className="w-4 h-4 text-red-500" />,
}

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-yellow-100 text-yellow-600',
  URGENT: 'bg-red-100 text-red-600',
}

const priorityLabels: Record<string, string> = {
  LOW: '低',
  NORMAL: '普通',
  HIGH: '高',
  URGENT: '紧急',
}

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<(Notification & { isRead: boolean })[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notification?pageSize=10')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
    setLoading(false)
  }

  const markAsRead = async (id: number) => {
    try {
      await fetch(`/api/notification/${id}?action=read`, { method: 'POST' })
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      )
      setUnreadCount((prev) => Math.max(0, prev - 1))
    } catch (error) {
      console.error('Failed to mark notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notification/read-all', { method: 'POST' })
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error)
    }
  }

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)
    if (notification.linkUrl && onNavigate) {
      onNavigate(notification.linkUrl)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-gray-500" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 bg-red-500 text-white text-xs h-5 w-5 flex items-center justify-center p-0">
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[500px] overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 py-2 mb-2">
          <h3 className="font-semibold text-sm">通知中心</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <Check className="w-4 h-4 mr-1" />
              全部已读
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <Bell className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm">暂无通知</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  notification.isRead
                    ? 'bg-gray-50 hover:bg-gray-100'
                    : 'bg-primary/5 hover:bg-primary/10 border border-primary/20'
                }`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex items-start gap-3">
                  {typeIcons[notification.type] || <Bell className="w-4 h-4 text-gray-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm text-gray-800 truncate">
                        {notification.title}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${priorityColors[notification.priority]}`}
                      >
                        {priorityLabels[notification.priority]}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {notification.content}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(notification.createdAt).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6"
                    onClick={(e) => {
                      e.stopPropagation()
                      markAsRead(notification.id)
                    }}
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onNavigate?.('/dashboard/notifications')}>
              查看全部通知
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}