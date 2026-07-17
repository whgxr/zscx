"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { User, Key, Phone, Mail, Shield, Clock, MessageCircle, Globe2, Link2, X } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface RoleInfo {
  id: number
  name: string
  label: string
}

interface UserProfile {
  id: number
  username: string
  realName: string
  phone: string | null
  email: string | null
  role: RoleInfo
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

interface ThirdPartyBinding {
  id: number
  platform: string
  openId: string
  unionId: string | null
  extraData: string | null
  createdAt: string
}

export function ProfileClient({ initialUser }: { initialUser: UserProfile }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'info' | 'password' | 'thirdparty'>('info')
  const [user, setUser] = useState<UserProfile>(initialUser)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [feishuBinding, setFeishuBinding] = useState<ThirdPartyBinding | null>(null)
  const [weworkBinding, setWeworkBinding] = useState<ThirdPartyBinding | null>(null)
  const [bindingLoading, setBindingLoading] = useState(false)

  useEffect(() => {
    loadThirdPartyBindings()
  }, [])

  const loadThirdPartyBindings = async () => {
    try {
      const [feishuRes, weworkRes] = await Promise.all([
        fetch('/api/third-party/feishu'),
        fetch('/api/third-party/wework'),
      ])
      if (feishuRes.ok) {
        const data = await feishuRes.json()
        setFeishuBinding(data.binding || null)
      }
      if (weworkRes.ok) {
        const data = await weworkRes.json()
        setWeworkBinding(data.binding || null)
      }
    } catch (error) {
      console.error('Failed to load third-party bindings:', error)
    }
  }

  const handleBindFeishu = () => {
    const redirectUri = `${window.location.origin}/dashboard/profile`
    window.location.href = `/api/third-party/feishu/auth?redirectUri=${encodeURIComponent(redirectUri)}`
  }

  const handleBindWework = () => {
    const redirectUri = `${window.location.origin}/dashboard/profile`
    window.location.href = `/api/third-party/wework/auth?redirectUri=${encodeURIComponent(redirectUri)}`
  }

  const handleUnbindFeishu = async () => {
    if (!confirm('确定要解绑飞书账号吗？')) return
    setBindingLoading(true)
    try {
      const res = await fetch('/api/third-party/feishu', { method: 'DELETE' })
      if (res.ok) {
        setFeishuBinding(null)
        setMessage({ type: 'success', text: '飞书账号解绑成功' })
      } else {
        setMessage({ type: 'error', text: '解绑失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '解绑失败' })
    } finally {
      setBindingLoading(false)
    }
  }

  const handleUnbindWework = async () => {
    if (!confirm('确定要解绑企业微信账号吗？')) return
    setBindingLoading(true)
    try {
      const res = await fetch('/api/third-party/wework', { method: 'DELETE' })
      if (res.ok) {
        setWeworkBinding(null)
        setMessage({ type: 'success', text: '企业微信账号解绑成功' })
      } else {
        setMessage({ type: 'error', text: '解绑失败' })
      }
    } catch {
      setMessage({ type: 'error', text: '解绑失败' })
    } finally {
      setBindingLoading(false)
    }
  }

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
                {roleLabels[user.role?.name] || user.role?.label || '未知'}
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
              <Button
                variant={activeTab === 'thirdparty' ? 'default' : 'ghost'}
                onClick={() => setActiveTab('thirdparty')}
              >
                <Globe2 className="w-4 h-4 mr-2" />
                第三方绑定
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
                    <Input value={roleLabels[user.role?.name] || user.role?.label || '未知'} disabled />
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
            ) : activeTab === 'password' ? (
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
            ) : (
              <div className="space-y-6">
                <Card className="border border-gray-200">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                          <MessageCircle className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">飞书</h4>
                          <p className="text-sm text-gray-500">绑定后可接收审批通知和消息推送</p>
                        </div>
                      </div>
                      {feishuBinding ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-100 text-green-600">已绑定</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUnbindFeishu}
                            disabled={bindingLoading}
                          >
                            <X className="w-4 h-4 mr-1" />
                            解绑
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={handleBindFeishu}
                          disabled={bindingLoading}
                        >
                          <Link2 className="w-4 h-4 mr-2" />
                          绑定飞书
                        </Button>
                      )}
                    </div>
                    {feishuBinding && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500">
                          绑定时间: {formatDateTime(feishuBinding.createdAt)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border border-gray-200">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Globe2 className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">企业微信</h4>
                          <p className="text-sm text-gray-500">绑定后可接收审批通知和消息推送</p>
                        </div>
                      </div>
                      {weworkBinding ? (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-100 text-green-600">已绑定</Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleUnbindWework}
                            disabled={bindingLoading}
                          >
                            <X className="w-4 h-4 mr-1" />
                            解绑
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={handleBindWework}
                          disabled={bindingLoading}
                        >
                          <Link2 className="w-4 h-4 mr-2" />
                          绑定企业微信
                        </Button>
                      )}
                    </div>
                    {weworkBinding && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-500">
                          绑定时间: {formatDateTime(weworkBinding.createdAt)}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>提示：</strong>绑定第三方账号后，您将在对应平台上收到审批通知和系统消息。您可以同时绑定飞书和企业微信。
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-end">
            {(activeTab === 'info' || activeTab === 'password') && (
              <Button
                onClick={activeTab === 'info' ? handleUpdateProfile : handleChangePassword}
                disabled={loading}
              >
                {loading ? '保存中...' : '保存'}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
