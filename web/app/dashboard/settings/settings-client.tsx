"use client"

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  Download,
  Trash2,
  RotateCcw,
  HardDriveDownload,
  HardDriveUpload,
  Loader2,
} from 'lucide-react'
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
  const [loading, setLoading] = useState(false)
  const isAdmin = userRole?.name === 'ADMIN'

  // 数据库备份相关状态
  const [backups, setBackups] = useState<Array<{ fileName: string; fileSize: number; createdAt: string }>>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false)
  const [restoringFileName, setRestoringFileName] = useState<string | null>(null)
  const [restoreLoading, setRestoreLoading] = useState(false)
  const [uploadLoading, setUploadLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchSettings()
    if (isAdmin) {
      fetchBackups()
    }
  }, [])

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        const timeout = parseInt(data.settings?.sessionTimeout || '30')
        setSessionTimeout(timeout)
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/database/backup')
      if (res.ok) {
        const data = await res.json()
        setBackups(data.backups || [])
      }
    } catch (err) {
      console.error('Fetch backups error:', err)
    }
  }

  const handleCreateBackup = async () => {
    setBackupLoading(true)
    try {
      const res = await fetch('/api/database/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        alert('数据库备份成功：' + data.backup.fileName)
        await fetchBackups()
      } else {
        const data = await res.json()
        alert(data.message || '备份失败')
      }
    } catch (err) {
      alert('备份失败')
    } finally {
      setBackupLoading(false)
    }
  }

  const handleDownloadBackup = (fileName: string) => {
    const url = `/api/database/backup/${encodeURIComponent(fileName)}`
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleDeleteBackup = async (fileName: string) => {
    if (!confirm(`确定要删除备份文件 ${fileName} 吗？`)) return
    try {
      const res = await fetch(`/api/database/backup/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchBackups()
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const openRestoreDialog = (fileName: string) => {
    setRestoringFileName(fileName)
    setRestoreDialogOpen(true)
  }

  const handleRestoreBackup = async () => {
    if (!restoringFileName) return
    setRestoreLoading(true)
    try {
      const res = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: restoringFileName }),
      })
      if (res.ok) {
        alert('数据库恢复成功')
        setRestoreDialogOpen(false)
        setRestoringFileName(null)
      } else {
        const data = await res.json()
        alert(data.message || '恢复失败')
      }
    } catch (err) {
      alert('恢复失败')
    } finally {
      setRestoreLoading(false)
    }
  }

  const handleUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 校验文件类型
    if (!file.name.endsWith('.sql') && !file.name.endsWith('.sql.gz')) {
      alert('请选择 .sql 或 .sql.gz 格式的备份文件')
      e.target.value = ''
      return
    }

    setUploadLoading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/database/backup/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        alert('备份文件上传成功：' + data.backup.fileName)
        await fetchBackups()
      } else {
        const data = await res.json()
        alert(data.message || '上传失败')
      }
    } catch (err) {
      alert('上传失败')
    } finally {
      setUploadLoading(false)
      e.target.value = ''
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
              <p className="font-medium mt-1">v1.2.1</p>
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

      {/* 数据库备份与恢复 - 仅超级系统管理员可见 */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HardDriveDownload className="w-5 h-5" />
              数据库备份与恢复
            </CardTitle>
            <CardDescription>
              备份和恢复系统数据库，仅超级系统管理员可操作
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div>
                  <p className="font-medium text-sm">立即备份数据库</p>
                  <p className="text-xs text-gray-500 mt-1">
                    创建当前数据库的完整备份（含表结构和数据）
                  </p>
                </div>
                <Button onClick={handleCreateBackup} disabled={backupLoading}>
                  {backupLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      备份中...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4 mr-2" />
                      创建备份
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div>
                  <p className="font-medium text-sm">上传备份文件恢复</p>
                  <p className="text-xs text-gray-500 mt-1">
                    上传 .sql 或 .sql.gz 备份文件到服务器，用于恢复数据库
                  </p>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept=".sql,.gz"
                  onChange={handleUploadBackup}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadLoading}
                >
                  {uploadLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      上传中...
                    </>
                  ) : (
                    <>
                      <HardDriveUpload className="w-4 h-4 mr-2" />
                      上传备份
                    </>
                  )}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">备份记录</Label>
                  <Button variant="outline" size="sm" onClick={fetchBackups}>
                    刷新
                  </Button>
                </div>
                {backups.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 border border-dashed rounded-lg">
                    <HardDriveDownload className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">暂无备份记录</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-80 overflow-y-auto">
                      {backups.map((backup) => (
                        <div
                          key={backup.fileName}
                          className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b last:border-b-0"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{backup.fileName}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatDate(backup.createdAt)} · {formatFileSize(backup.fileSize)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="下载备份"
                              onClick={() => handleDownloadBackup(backup.fileName)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="恢复此备份"
                              onClick={() => openRestoreDialog(backup.fileName)}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              title="删除备份"
                              onClick={() => handleDeleteBackup(backup.fileName)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-700">
                  注意：恢复操作将覆盖当前数据库的所有数据，请谨慎操作。建议在恢复前先创建一份新的备份。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              const isDisabled = module.adminOnly && !isAdmin
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

      {/* 恢复确认对话框 */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认恢复数据库</DialogTitle>
            <DialogDescription>
              此操作将用备份文件覆盖当前数据库的所有数据，且不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">警告</p>
              <p className="text-sm text-red-600 mt-1">
                恢复后当前数据库的所有数据将被替换为备份时的数据。建议在恢复前先创建一份新的备份。
              </p>
            </div>
            {restoringFileName && (
              <p className="text-sm text-gray-500 mt-3">
                将恢复的备份文件：<span className="font-mono text-gray-700">{restoringFileName}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleRestoreBackup} disabled={restoreLoading}>
              {restoreLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  恢复中...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  确认恢复
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}