"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Database, Users, FileText, Paperclip,
  Clock, LogOut, ChevronRight, Shield, Server,
  Monitor, Smartphone, Wrench, HardDrive
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

  const manageItems = [
    {
      label: '项目管理',
      desc: '管理数据表、字段配置',
      icon: Database,
      color: 'bg-blue-50 text-blue-500',
      href: '/dashboard/tables',
    },
    {
      label: '用户管理',
      desc: '管理用户账号和角色',
      icon: Users,
      color: 'bg-green-50 text-green-500',
      href: '/dashboard/users',
    },
    {
      label: '权限管理',
      desc: '配置用户访问权限',
      icon: Shield,
      color: 'bg-purple-50 text-purple-500',
      href: '/dashboard/permissions',
    },
    {
      label: '模板管理',
      desc: '设计导出打印模板',
      icon: Wrench,
      color: 'bg-orange-50 text-orange-500',
      href: '/dashboard/export-templates',
    },
  ]

  return (
    <div className="px-4 pt-4 pb-24">
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
              <p className="mt-0.5 text-gray-900">房屋征收调查系统</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">版本</p>
              <p className="mt-0.5 text-gray-900">v1.1.1</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">数据库</p>
              <p className="mt-0.5 text-gray-900">MySQL</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">运行环境</p>
              <p className="mt-0.5 text-gray-900">Docker</p>
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
                无操作后自动退出登录
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

      {/* 管理功能入口 */}
      <div className="bg-white rounded-xl shadow-sm mb-4">
        <div className="p-4">
          <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-gray-500" />
            管理功能
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            以下功能将在电脑端浏览器中打开
          </p>
          <div className="grid grid-cols-2 gap-2">
            {manageItems.map(item => {
              const Icon = item.icon
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-900">{item.label}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                </a>
              )
            })}
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