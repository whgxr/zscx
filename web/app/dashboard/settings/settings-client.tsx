"use client"

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Database,
  Users,
  FileText,
  Paperclip,
  Palette,
  Activity,
  Server,
  Shield,
} from 'lucide-react'
import { Role } from '@prisma/client'

interface SettingsClientProps {
  userRole: Role
  stats: {
    tables: number
    users: number
    records: number
    files: number
    templates: number
    logs: number
  }
}

export function SettingsClient({ userRole, stats }: SettingsClientProps) {
  const statItems = [
    { label: '数据表', value: stats.tables, icon: Database, color: 'text-blue-500' },
    { label: '用户数', value: stats.users, icon: Users, color: 'text-green-500' },
    { label: '记录数', value: stats.records, icon: FileText, color: 'text-purple-500' },
    { label: '附件数', value: stats.files, icon: Paperclip, color: 'text-orange-500' },
    { label: '导出模板', value: stats.templates, icon: Palette, color: 'text-pink-500' },
    { label: '操作日志', value: stats.logs, icon: Activity, color: 'text-gray-500' },
  ]

  const modules = [
    {
      title: '数据表管理',
      description: '创建和管理动态数据表，自定义字段类型',
      href: '/dashboard/tables',
      icon: Database,
      adminOnly: false,
    },
    {
      title: '用户管理',
      description: '管理系统用户账号、角色和状态',
      href: '/dashboard/users',
      icon: Users,
      adminOnly: true,
    },
    {
      title: '权限管理',
      description: '细粒度按表权限分配（查看/新增/编辑/删除/导出）',
      href: '/dashboard/permissions',
      icon: Shield,
      adminOnly: false,
    },
    {
      title: '导出模板',
      description: '可视化设计 Excel/PDF 导出模板',
      href: '/dashboard/export-templates',
      icon: Palette,
      adminOnly: false,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>
        <p className="text-gray-500 mt-1">系统概览和管理功能入口</p>
      </div>

      {/* 统计数据 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statItems.map(item => {
          const Icon = item.icon
          return (
            <Card key={item.label}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div className="text-2xl font-bold">{item.value}</div>
                <div className="text-sm text-gray-500">{item.label}</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 系统信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Server className="w-5 h-5" />
            系统信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">系统名称</span>
              <p className="font-medium mt-1">房屋征收调查系统</p>
            </div>
            <div>
              <span className="text-gray-500">版本</span>
              <p className="font-medium mt-1">v1.1.0</p>
            </div>
            <div>
              <span className="text-gray-500">数据库</span>
              <p className="font-medium mt-1">MySQL 5.7</p>
            </div>
            <div>
              <span className="text-gray-500">运行环境</span>
              <p className="font-medium mt-1">Docker</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 管理功能入口 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">管理功能</CardTitle>
          <CardDescription>快速进入各管理模块</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map(module => {
              const Icon = module.icon
              const isDisabled = module.adminOnly && userRole !== 'ADMIN'
              return (
                <a
                  key={module.href}
                  href={isDisabled ? undefined : module.href}
                  className={`flex items-center gap-4 p-4 border rounded-lg transition-colors ${
                    isDisabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:border-primary hover:bg-primary/5'
                  }`}
                >
                  <div className="p-2.5 bg-gray-100 rounded-lg">
                    <Icon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{module.title}</span>
                      {module.adminOnly && (
                        <Badge variant="secondary" className="text-xs">仅管理员</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{module.description}</p>
                  </div>
                </a>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
