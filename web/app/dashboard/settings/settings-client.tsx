"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Database,
  Users,
  FileText,
  Paperclip,
  Palette,
  Activity,
  Server,
  Shield,
  Settings2,
  Clock,
  AlertCircle,
  LayoutDashboard,
  MessageSquare,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Role } from '@prisma/client'

interface SettingsClientProps {
  userRole: { name: string } | null
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
  const [sessionTimeout, setSessionTimeout] = useState(30)
  const [feishuEnabled, setFeishuEnabled] = useState(false)
  const [feishuWebhookUrl, setFeishuWebhookUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingFeishu, setSavingFeishu] = useState(false)
  const [testingWebhook, setTestingWebhook] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        const timeout = parseInt(data.settings?.sessionTimeout || '30')
        setSessionTimeout(timeout)
        setFeishuEnabled(data.settings?.feishu_enabled === 'true')
        setFeishuWebhookUrl(data.settings?.feishu_webhook_url || '')
      }
    } catch (err) {
      console.error('Fetch settings error:', err)
    }
  }

  const saveSettings = async () => {
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
    } catch (err) {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const saveFeishuSettings = async () => {
    setSavingFeishu(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            feishu_enabled: feishuEnabled.toString(),
            feishu_webhook_url: feishuWebhookUrl,
          },
        }),
      })
      if (res.ok) {
        alert('飞书配置保存成功')
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    } finally {
      setSavingFeishu(false)
    }
  }

  const testFeishuWebhook = async () => {
    if (!feishuWebhookUrl) {
      alert('请先填写Webhook地址')
      return
    }
    setTestingWebhook(true)
    try {
      const response = await fetch(feishuWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msg_type: 'text',
          content: {
            text: '🔔 飞书Webhook连接测试成功！\n来自：房屋征收调查系统',
          },
        }),
      })
      const result = await response.json()
      if (result.code === 0 || result.StatusCode === 0) {
        alert('测试消息发送成功！请检查飞书群是否收到消息')
      } else {
        alert('测试失败：' + (result.msg || result.ErrMsg || '未知错误'))
      }
    } catch (err) {
      alert('测试失败：网络错误')
    } finally {
      setTestingWebhook(false)
    }
  }

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
      title: '仪表盘设置',
      description: '自定义仪表盘小组件和布局',
      href: '/dashboard',
      icon: LayoutDashboard,
      adminOnly: false,
    },
    {
      title: '版本管理',
      description: '管理版本更新记录，同步到飞书群',
      href: '/dashboard/versions',
      icon: FileText,
      adminOnly: false,
    },
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
      title: '角色管理',
      description: '自定义角色和角色权限配置',
      href: '/dashboard/roles',
      icon: Settings2,
      adminOnly: true,
    },
    {
      title: '导出模板设计',
      description: '可视化设计 Excel/PDF 导出模板',
      href: '/dashboard/export-templates',
      icon: Palette,
      adminOnly: false,
    },
    {
      title: '操作日志',
      description: '查看系统操作记录和审计日志',
      href: '/dashboard/logs',
      icon: Activity,
      adminOnly: true,
    },
    {
      title: '错误日志',
      description: '查看系统运行时错误和异常记录',
      href: '/dashboard/error-logs',
      icon: AlertCircle,
      adminOnly: true,
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

      {/* 安全设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            安全设置
          </CardTitle>
          <CardDescription>配置系统安全相关参数</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                自动退出时间（分钟）
              </Label>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(Math.max(1, parseInt(e.target.value) || 30))}
                  className="w-32"
                  min="1"
                  max="1440"
                />
                <span className="text-gray-500">分钟</span>
                <p className="text-sm text-gray-500 flex-1">
                  用户在指定时间内不进行任何操作将自动退出登录，默认30分钟
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={loading}>
                {loading ? '保存中...' : '保存设置'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 飞书集成设置 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            飞书集成
          </CardTitle>
          <CardDescription>配置飞书机器人Webhook，用于版本更新通知</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  启用飞书通知
                </Label>
                <p className="text-sm text-gray-500 mt-1">
                  开启后，新版本发布时将自动发送通知到飞书群
                </p>
              </div>
              <Switch
                checked={feishuEnabled}
                onCheckedChange={setFeishuEnabled}
              />
            </div>

            <div className="space-y-2">
              <Label>飞书自定义机器人 Webhook 地址</Label>
              <Textarea
                value={feishuWebhookUrl}
                onChange={(e) => setFeishuWebhookUrl(e.target.value)}
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/xxxxx"
                className="font-mono text-sm"
                rows={2}
              />
              <p className="text-sm text-gray-500">
                在飞书群设置中添加「自定义机器人」，将Webhook地址粘贴到此处。
                <a
                  href="https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline ml-1"
                >
                  查看配置指南
                </a>
              </p>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="outline"
                onClick={testFeishuWebhook}
                disabled={testingWebhook || !feishuWebhookUrl}
              >
                {testingWebhook ? '测试中...' : '发送测试消息'}
              </Button>
              <Button onClick={saveFeishuSettings} disabled={savingFeishu}>
                {savingFeishu ? '保存中...' : '保存配置'}
              </Button>
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
              const isDisabled = module.adminOnly && userRole?.name !== 'ADMIN'
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