"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  User, Mail, Phone, Shield, Clock, LogOut,
  FileText, Paperclip, Key, ChevronRight, Save, Loader2
} from 'lucide-react'

const roleLabels: Record<string, string> = { ADMIN: '超级管理员', MANAGER: '管理员', USER: '录入员', VIEWER: '查看员' }

export function H5ProfileClient({ user, stats }: { user: any; stats: { records: number; attachments: number } }) {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [password, setPassword] = useState({ old: '', new: '', confirm: '' })
  const [changingPassword, setChangingPassword] = useState(false)

  const handleChangePassword = async () => {
    if (password.old.length < 6) { alert('请输入当前密码'); return }
    if (password.new.length < 6) { alert('新密码至少6位'); return }
    if (password.new !== password.confirm) { alert('两次密码不一致'); return }

    setChangingPassword(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: password.old, newPassword: password.new }),
      })
      if (res.ok) {
        alert('密码修改成功')
        setShowPassword(false)
        setPassword({ old: '', new: '', confirm: '' })
      } else {
        const data = await res.json()
        alert(data.message || '修改失败')
      }
    } catch {
      alert('网络错误')
    } finally {
      setChangingPassword(false)
    }
  }

  const handleLogout = async () => {
    if (!confirm('确定退出登录吗？')) return
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/h5/login')
      router.refresh()
    } catch {
      router.push('/h5/login')
    }
  }

  return (
    <div className="px-4 pt-4 pb-24">
      {/* 用户信息卡片 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary font-bold text-2xl">{(user.realName || user.username).charAt(0)}</span>
          </div>
          <div>
            <h2 className="text-lg font-bold">{user.realName || user.username}</h2>
            <p className="text-sm text-gray-500">@{user.username}</p>
            <Badge className="mt-1 text-xs" variant="secondary">
              {roleLabels[user.role?.name] || user.role?.name}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-primary">{stats.records}</p>
            <p className="text-xs text-gray-500">录入记录</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.attachments}</p>
            <p className="text-xs text-gray-500">上传附件</p>
          </div>
        </div>
      </div>

      {/* 账号信息 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">账号信息</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">用户名</p>
                <p className="text-sm">{user.username}</p>
              </div>
            </div>
            {user.email && (
              <div className="flex items-center gap-3">
                <Mail className="w-4 h-4 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400">邮箱</p>
                  <p className="text-sm">{user.email}</p>
                </div>
              </div>
            )}
            {user.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-400" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400">手机号</p>
                  <p className="text-sm">{user.phone}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">角色</p>
                <p className="text-sm">{roleLabels[user.role?.name] || user.role?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-400">注册时间</p>
                <p className="text-sm">{new Date(user.createdAt).toLocaleString('zh-CN')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 修改密码 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div
          className="p-4 flex items-center justify-between cursor-pointer"
          onClick={() => setShowPassword(!showPassword)}
        >
          <div className="flex items-center gap-3">
            <Key className="w-4 h-4 text-gray-400" />
            <span className="text-sm">修改密码</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform ${showPassword ? 'rotate-90' : ''}`} />
        </div>

        {showPassword && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <Label className="text-xs text-gray-500">当前密码</Label>
              <Input
                type="password"
                value={password.old}
                onChange={(e) => setPassword({ ...password, old: e.target.value })}
                className="h-10 text-sm rounded-lg mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">新密码</Label>
              <Input
                type="password"
                value={password.new}
                onChange={(e) => setPassword({ ...password, new: e.target.value })}
                className="h-10 text-sm rounded-lg mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">确认新密码</Label>
              <Input
                type="password"
                value={password.confirm}
                onChange={(e) => setPassword({ ...password, confirm: e.target.value })}
                className="h-10 text-sm rounded-lg mt-1"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="w-full h-10 rounded-xl"
            >
              {changingPassword ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />修改中...</> : <><Save className="w-4 h-4 mr-2" />保存密码</>}
            </Button>
          </div>
        )}
      </div>

      {/* 退出登录 */}
      <Button
        variant="outline"
        className="w-full h-11 rounded-xl text-red-500 border-red-200 hover:bg-red-50"
        onClick={handleLogout}
      >
        <LogOut className="w-4 h-4 mr-2" />
        退出登录
      </Button>
    </div>
  )
}