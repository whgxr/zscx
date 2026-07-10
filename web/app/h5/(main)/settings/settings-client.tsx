"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Database, Users, FileText, Paperclip,
  Clock, LogOut, ChevronRight, Shield, Server
} from 'lucide-react'

interface H5SettingsClientProps {
  user: any
  stats: { tables: number; users: number; records: number; files: number }
  settings: Record<string, string>
}

export function H5SettingsClient({ user, stats, settings }: H5SettingsClientProps) {
  const router = useRouter()
  const [sessionTimeout, setSessionTimeout] = useState(
    parseInt(settings.sessionTimeout || '30', 10)
  )
  const [loading, setLoading] = useState(false)

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

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: { sessionTimeout: sessionTimeout.toString() } }),
      })
      if (res.ok) {
        alert('设置保存成功')
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const statItems = [
    { label: '数据表', value: stats.tables, icon: Database, color: 'text-blue-500 bg-blue-50' },
    { label: '用户数', value: stats.users, icon: Users, color: 'text-green-500 bg-green-50' },
    { label: '记录数', value: stats.records, icon: FileText, color: 'text-purple-500 bg-purple-50' },
    { label: '附件数', value: stats.files, icon: Paperclip, color: 'text-orange-500 bg-orange-50' },
  ]

  return (
    <div className="px-4 pt-4 pb-4">
      {/* 头部 */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">系统设置</h1>
        <p className="text-sm text-gray-500 mt-1">系统概览和管理</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {statItems.map(item => {
          const Icon = item.icon
          return (
            <div key={item.label} className="bg-white rounded-xl p-4 shadow-sm">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${item.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{item.value}</div>
              <div className="text-xs text-gray-500">{item.label}</div>
            </div>
          )
        })}
      </div>

      {/* 系统信息 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-gray-500" />
            系统信息
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">系统名称</p>
              <p className="mt-0.5">房屋征收调查系统</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">版本</p>
              <p className="mt-0.5">v1.1.1</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">数据库</p>
              <p className="mt-0.5">MySQL</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">运行环境</p>
              <p className="mt-0.5">Docker</p>
            </div>
          </div>
        </div>
      </div>

      {/* 安全设置 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-gray-500" />
            安全设置
          </h3>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500">自动退出时间（分钟）</Label>
              <div className="flex items-center gap-3 mt-1">
                <Input
                  type="number"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(Math.max(1, parseInt(e.target.value) || 30))}
                  className="w-24 h-10 text-sm rounded-lg"
                  min={1}
                  max={1440}
                />
                <span className="text-sm text-gray-500">分钟</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                用户在指定时间内无操作将自动退出登录
              </p>
            </div>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full h-10 rounded-xl"
            >
              {loading ? '保存中...' : '保存设置'}
            </Button>
          </div>
        </div>
      </div>

      {/* 管理入口 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-gray-500" />
            管理功能
          </h3>
          <div className="divide-y">
            <a href="/dashboard/tables" className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-gray-500" />
                <span className="text-sm">项目管理</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </a>
            <a href="/dashboard/users" className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="text-sm">用户管理</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </a>
            <a href="/dashboard/permissions" className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-gray-500" />
                <span className="text-sm">权限管理</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </a>
          </div>
        </div>
      </div>

      {/* 用户信息和退出 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-primary font-bold text-lg">
                {(user.realName || user.username).charAt(0)}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium">{user.realName || user.username}</p>
              <p className="text-xs text-gray-500">
                {user.role?.name === 'ADMIN' ? '超级管理员' : '管理员'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-500 h-8 rounded-lg"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-1" />
            退出
          </Button>
        </div>
      </div>
    </div>
  )
}