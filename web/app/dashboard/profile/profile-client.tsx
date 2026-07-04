"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { User, Key, Phone, Mail, Shield, Clock } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface UserProfile {
  id: number
  username: string
  realName: string
  phone: string | null
  email: string | null
  role: string
  status: string
  avatar: string | null
  createdAt: string
  updatedAt: string
}

const roleLabels: Record<string, string> = {
  ADMIN: '超级管理员',
  MANAGER: '管理员',
  USER: '普通用户',
  VIEWER: '查看员',
}

export function ProfileClient({ initialUser }: { initialUser: UserProfile }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'info' | 'password'>('info')
  const [user, setUser] = useState<UserProfile>(initialUser)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [formData, setFormData] = useState({
    realName: user.realName,
    phone: user.phone || '',
    email: user.email || '',
  })

  const [passwordForm, setPasswordForm] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const handleUpdateProfile = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (res.ok) {
        setUser(data.user)
        setMessage({ type: 'success', text: '个人资料更新成功' })
        router.refresh()
      } else {
        setMessage({ type: 'error', text: data.message || '更新失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新失败' })
    } finally {
      setLoading(false)
    }
  }

  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage({ type: 'error', text: '两次输入的新密码不一致' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oldPassword: passwordForm.oldPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '密码修改成功' })
        setPasswordForm({ oldPassword: '', newPassword: '', confirmPassword: '' })
      } else {
        setMessage({ type: 'error', text: data.message || '修改失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '修改失败' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">个人资料</h1>
        <p className="text-gray-500 mt-1">查看和修改您的个人信息</p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-4">
                <User className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold">{user.realName}</h3>
              <p className="text-sm text-gray-500">@{user.username}</p>
              <Badge className="mt-2">
                {roleLabels[user.role] || user.role}
              </Badge>
            </div>
            <div className="mt-6 space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">{user.phone || '未设置'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">{user.email || '未设置'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">账号{user.status === 'ACTIVE' ? '正常' : '已禁用'}</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">注册于 {formatDateTime(user.createdAt)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex gap-4">
              <Button
                variant={activeTab === 'info' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('info')}
              >
                <User className="w-4 h-4 mr-2" />
                基本信息
              </Button>
              <Button
                variant={activeTab === 'password' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('password')}
              >
                <Key className="w-4 h-4 mr-2" />
                修改密码
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeTab === 'info' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>用户名</Label>
                    <Input value={user.username} disabled />
                  </div>
                  <div className="space-y-2">
                    <Label>角色</Label>
                    <Input value={roleLabels[user.role] || user.role} disabled />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="realName">真实姓名 *</Label>
                  <Input
                    id="realName"
                    value={formData.realName}
                    onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">手机号</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="请输入手机号"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="请输入邮箱"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="oldPassword">旧密码 *</Label>
                  <Input
                    id="oldPassword"
                    type="password"
                    value={passwordForm.oldPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                    placeholder="请输入旧密码"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">新密码 *</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    placeholder="请输入新密码（至少6位）"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">确认新密码 *</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="请再次输入新密码"
                  />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            <Button
              onClick={activeTab === 'info' ? handleUpdateProfile : handleChangePassword}
              disabled={loading}
            >
              {loading ? '保存中...' : '保存'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
