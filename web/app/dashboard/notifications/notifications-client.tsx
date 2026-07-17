"use client"

import { useState, useEffect } from 'react'
import { 
  Bell, 
  X, 
  Check, 
  AlertCircle, 
  FileText, 
  MessageSquare, 
  Send,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
interface NotificationCreator {
  realName: string | null
  avatar: string | null
}

interface NotificationWithCreator extends Omit<import('@prisma/client').Notification, 'creator'> {
  creator: NotificationCreator | null
}

interface UserRole {
  id: number
  name: string
  label: string
  canPublishNotification: boolean
}

interface UserWithRole extends Omit<import('@prisma/client').User, 'role'> {
  role: UserRole
}

interface NotificationsClientProps {
  user: UserWithRole
}

const typeIcons: Record<string, React.ReactNode> = {
  SYSTEM: <AlertCircle className="w-5 h-5 text-blue-500" />,
  BUSINESS: <FileText className="w-5 h-5 text-green-500" />,
  APPROVAL: <MessageSquare className="w-5 h-5 text-yellow-500" />,
  ALERT: <Bell className="w-5 h-5 text-red-500" />,
}

const typeLabels: Record<string, string> = {
  SYSTEM: '系统通知',
  BUSINESS: '业务通知',
  APPROVAL: '审批通知',
  ALERT: '系统告警',
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

export function NotificationsClient({ user }: NotificationsClientProps) {
  const [notifications, setNotifications] = useState<(NotificationWithCreator & { isRead: boolean })[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [formData, setFormData] = useState({
    type: 'SYSTEM',
    title: '',
    content: '',
    targetType: 'ALL',
    targetRoleId: '',
    targetUserIds: [],
    priority: 'NORMAL',
  })

  useEffect(() => {
    loadNotifications()
  }, [activeTab])

  const loadNotifications = async () => {
    try {
      const url = activeTab === 'all' 
        ? '/api/notification?pageSize=50' 
        : `/api/notification?type=${activeTab}&pageSize=50`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error('Failed to load notifications:', error)
    }
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

  const deleteNotification = async (id: number) => {
    try {
      await fetch(`/api/notification/${id}`, { method: 'DELETE' })
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    } catch (error) {
      console.error('Failed to delete notification:', error)
    }
  }

  const handlePublish = async () => {
    if (!formData.title || !formData.content) {
      alert('请填写标题和内容')
      return
    }

    try {
      await fetch('/api/notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          targetRoleId: formData.targetRoleId ? parseInt(formData.targetRoleId) : undefined,
          targetUserIds: formData.targetUserIds.length > 0 ? formData.targetUserIds : undefined,
        }),
      })
      setShowPublishDialog(false)
      setFormData({
        type: 'SYSTEM',
        title: '',
        content: '',
        targetType: 'ALL',
        targetRoleId: '',
        targetUserIds: [],
        priority: 'NORMAL',
      })
      loadNotifications()
    } catch (error) {
      console.error('Failed to publish notification:', error)
    }
  }

  const filteredNotifications = notifications.filter(n =>
    n.title.toLowerCase().includes(searchKeyword.toLowerCase()) ||
    n.content.toLowerCase().includes(searchKeyword.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">通知中心</h1>
          <p className="text-sm text-gray-500 mt-1">查看和管理系统通知</p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button variant="outline" onClick={markAllAsRead}>
              <Check className="w-4 h-4 mr-2" />
              全部已读 ({unreadCount})
            </Button>
          )}
          {user.role?.canPublishNotification && (
            <Button onClick={() => setShowPublishDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              发布通知
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部 ({notifications.length})</TabsTrigger>
          <TabsTrigger value="SYSTEM">系统通知</TabsTrigger>
          <TabsTrigger value="BUSINESS">业务通知</TabsTrigger>
          <TabsTrigger value="APPROVAL">审批通知</TabsTrigger>
          <TabsTrigger value="ALERT">系统告警</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <Input
              placeholder="搜索通知..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" onClick={loadNotifications}>
              <RefreshCw className="w-4 h-4 mr-1" />
              刷新
            </Button>
          </div>

          <div className="space-y-3">
            {filteredNotifications.map((notification) => (
              <Card 
                key={notification.id} 
                className={`p-4 transition-colors ${
                  notification.isRead ? 'bg-white' : 'bg-primary/5 border-primary/20'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                    notification.isRead ? 'bg-gray-100' : 'bg-primary/10'
                  }`}>
                    {typeIcons[notification.type] || <Bell className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-gray-900">{notification.title}</span>
                      <Badge className={priorityColors[notification.priority]}>
                        {priorityLabels[notification.priority]}
                      </Badge>
                      <span className="text-xs text-gray-400">{typeLabels[notification.type]}</span>
                    </div>
                    <p className="text-sm text-gray-600">{notification.content}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span>{new Date(notification.createdAt).toLocaleString('zh-CN')}</span>
                      {notification.creator && (
                        <span>发布人: {notification.creator.realName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!notification.isRead && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => markAsRead(notification.id)}
                      >
                        <Check className="w-4 h-4 mr-1" />
                        标记已读
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-red-500"
                      onClick={() => deleteNotification(notification.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {filteredNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Bell className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">暂无通知</p>
              <p className="text-sm">系统会在这里显示通知信息</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>发布通知</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">通知类型</label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SYSTEM">系统通知</SelectItem>
                  <SelectItem value="BUSINESS">业务通知</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">优先级</label>
              <Select value={formData.priority} onValueChange={(value) => setFormData({ ...formData, priority: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">低</SelectItem>
                  <SelectItem value="NORMAL">普通</SelectItem>
                  <SelectItem value="HIGH">高</SelectItem>
                  <SelectItem value="URGENT">紧急</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">发送范围</label>
              <Select value={formData.targetType} onValueChange={(value) => setFormData({ ...formData, targetType: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部用户</SelectItem>
                  <SelectItem value="ROLE">指定角色</SelectItem>
                  <SelectItem value="USER">指定用户</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.targetType === 'ROLE' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">选择角色</label>
                <Select value={formData.targetRoleId} onValueChange={(value) => setFormData({ ...formData, targetRoleId: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择角色" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">管理员</SelectItem>
                    <SelectItem value="2">录入员</SelectItem>
                    <SelectItem value="3">查看员</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">标题</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="输入通知标题"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">内容</label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="输入通知内容"
                className="h-32"
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowPublishDialog(false)}>
                取消
              </Button>
              <Button onClick={handlePublish}>
                <Send className="w-4 h-4 mr-2" />
                发布通知
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}