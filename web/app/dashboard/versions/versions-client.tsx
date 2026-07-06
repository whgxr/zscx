"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Plus,
  Send,
  Edit2,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Package,
  Sparkles,
  Bug,
  Zap,
  Calendar,
  User,
  MessageSquare,
  AlertCircle,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface VersionLogEntry {
  id: number
  version: string
  title: string
  description: string | null
  changes: {
    features: string[]
    fixes: string[]
    improvements: string[]
  }
  releaseDate: string | null
  createdBy: number | null
  createdAt: string
  updatedAt: string
  creator: {
    id: number
    username: string
    realName: string
  } | null
}

interface VersionsClientProps {
  userRole: { name: string } | null
  feishuEnabled: boolean
  feishuConfigured: boolean
}

export function VersionsClient({ userRole, feishuEnabled, feishuConfigured }: VersionsClientProps) {
  const router = useRouter()
  const [logs, setLogs] = useState<VersionLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingLog, setEditingLog] = useState<VersionLogEntry | null>(null)

  const [formData, setFormData] = useState({
    version: '',
    title: '',
    description: '',
    releaseDate: '',
    features: '' as string,
    fixes: '' as string,
    improvements: '' as string,
  })

  const [submitting, setSubmitting] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)

  const canManage = userRole?.name === 'ADMIN' || userRole?.name === 'MANAGER'

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (searchTerm) params.set('search', searchTerm)

      const res = await fetch(`/api/version-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('Fetch version logs error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, searchTerm])

  const totalPages = Math.ceil(total / pageSize)

  const openCreateDialog = () => {
    setFormData({
      version: '',
      title: '',
      description: '',
      releaseDate: new Date().toISOString().split('T')[0],
      features: '',
      fixes: '',
      improvements: '',
    })
    setIsCreateDialogOpen(true)
  }

  const openEditDialog = (log: VersionLogEntry) => {
    setEditingLog(log)
    setFormData({
      version: log.version,
      title: log.title,
      description: log.description || '',
      releaseDate: log.releaseDate ? new Date(log.releaseDate).toISOString().split('T')[0] : '',
      features: log.changes?.features?.join('\n') || '',
      fixes: log.changes?.fixes?.join('\n') || '',
      improvements: log.changes?.improvements?.join('\n') || '',
    })
    setIsEditDialogOpen(true)
  }

  const handleCreate = async () => {
    if (!formData.version || !formData.title) {
      alert('请填写版本号和标题')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/version-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: formData.version,
          title: formData.title,
          description: formData.description || undefined,
          releaseDate: formData.releaseDate || null,
          changes: {
            features: formData.features.split('\n').filter(f => f.trim()),
            fixes: formData.fixes.split('\n').filter(f => f.trim()),
            improvements: formData.improvements.split('\n').filter(f => f.trim()),
          },
        }),
      })

      if (res.ok) {
        alert('创建成功')
        setIsCreateDialogOpen(false)
        fetchLogs()
      } else {
        const data = await res.json()
        alert(data.message || '创建失败')
      }
    } catch (err) {
      alert('创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingLog) return
    if (!formData.version || !formData.title) {
      alert('请填写版本号和标题')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/version-logs/${editingLog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: formData.version,
          title: formData.title,
          description: formData.description || undefined,
          releaseDate: formData.releaseDate || null,
          changes: {
            features: formData.features.split('\n').filter(f => f.trim()),
            fixes: formData.fixes.split('\n').filter(f => f.trim()),
            improvements: formData.improvements.split('\n').filter(f => f.trim()),
          },
        }),
      })

      if (res.ok) {
        alert('更新成功')
        setIsEditDialogOpen(false)
        setEditingLog(null)
        fetchLogs()
      } else {
        const data = await res.json()
        alert(data.message || '更新失败')
      }
    } catch (err) {
      alert('更新失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此版本记录吗？')) return

    try {
      const res = await fetch(`/api/version-logs/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        alert('删除成功')
        fetchLogs()
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const handleSync = async (log: VersionLogEntry) => {
    if (!feishuEnabled || !feishuConfigured) {
      alert('请先在系统设置中配置并启用飞书集成')
      return
    }

    setSyncingId(log.id)
    try {
      const res = await fetch(`/api/version-logs/${log.id}/sync`, {
        method: 'POST',
      })

      const data = await res.json()
      if (data.success) {
        alert('同步成功！请检查飞书群')
      } else {
        alert(data.message || '同步失败')
      }
    } catch (err) {
      alert('同步失败')
    } finally {
      setSyncingId(null)
    }
  }

  const getChangeCount = (log: VersionLogEntry) => {
    const features = log.changes?.features?.length || 0
    const fixes = log.changes?.fixes?.length || 0
    const improvements = log.changes?.improvements?.length || 0
    return { features, fixes, improvements, total: features + fixes + improvements }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/dashboard/settings')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">版本管理</h1>
            <p className="text-gray-500 mt-1">管理版本更新记录，同步到飞书群</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(!feishuEnabled || !feishuConfigured) && (
            <Badge variant="outline" className="text-amber-600 bg-amber-50 border-amber-200">
              <AlertCircle className="w-3 h-3 mr-1" />
              飞书未配置
            </Badge>
          )}
          {feishuEnabled && feishuConfigured && (
            <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">
              <MessageSquare className="w-3 h-3 mr-1" />
              飞书已连接
            </Badge>
          )}
          {canManage && (
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              新建版本
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-500" />
              版本记录
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索版本号、标题..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">版本号</TableHead>
                <TableHead>标题</TableHead>
                <TableHead className="w-28">发布日期</TableHead>
                <TableHead className="w-32">变更统计</TableHead>
                <TableHead className="w-28">创建人</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? (
                logs.map((log) => {
                  const counts = getChangeCount(log)
                  return (
                    <TableRow key={log.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          v{log.version}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{log.title}</div>
                        {log.description && (
                          <div className="text-sm text-gray-500 truncate max-w-md" title={log.description}>
                            {log.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-gray-600">
                        {log.releaseDate ? formatDate(log.releaseDate) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs">
                          {counts.features > 0 && (
                            <span className="flex items-center gap-1 text-green-600">
                              <Sparkles className="w-3 h-3" />
                              {counts.features}
                            </span>
                          )}
                          {counts.fixes > 0 && (
                            <span className="flex items-center gap-1 text-red-600">
                              <Bug className="w-3 h-3" />
                              {counts.fixes}
                            </span>
                          )}
                          {counts.improvements > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              <Zap className="w-3 h-3" />
                              {counts.improvements}
                            </span>
                          )}
                          {counts.total === 0 && (
                            <span className="text-gray-400">无变更</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.creator ? log.creator.realName : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSync(log)}
                            disabled={syncingId === log.id || !feishuEnabled || !feishuConfigured}
                            className="h-8 px-2"
                            title="同步到飞书"
                          >
                            <Send className={`w-4 h-4 ${syncingId === log.id ? 'animate-pulse' : ''}`} />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(log)}
                                className="h-8 px-2"
                                title="编辑"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {userRole?.name === 'ADMIN' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(log.id)}
                                  className="h-8 px-2 text-red-500 hover:text-red-600"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>{loading ? '加载中...' : '暂无版本记录'}</p>
                    {canManage && !loading && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={openCreateDialog}>
                        <Plus className="w-4 h-4 mr-2" />
                        创建第一个版本
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-gray-500">
                共 {total} 条记录，第 {page} / {totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新建版本对话框 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              新建版本
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>版本号 <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData(f => ({ ...f, version: e.target.value }))}
                  placeholder="例如：1.2.0"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  <Calendar className="w-4 h-4 inline mr-1" />
                  发布日期
                </Label>
                <Input
                  type="date"
                  value={formData.releaseDate}
                  onChange={(e) => setFormData(f => ({ ...f, releaseDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>标题 <span className="text-red-500">*</span></Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
                placeholder="例如：功能优化与Bug修复"
              />
            </div>

            <div className="space-y-2">
              <Label>版本说明</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                placeholder="简要描述本次版本更新的主要内容..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-500" />
                新增功能
                <span className="text-xs text-gray-400 font-normal">（每行一条）</span>
              </Label>
              <Textarea
                value={formData.features}
                onChange={(e) => setFormData(f => ({ ...f, features: e.target.value }))}
                placeholder="新增用户管理模块&#10;新增数据导出功能"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-red-500" />
                修复Bug
                <span className="text-xs text-gray-400 font-normal">（每行一条）</span>
              </Label>
              <Textarea
                value={formData.fixes}
                onChange={(e) => setFormData(f => ({ ...f, fixes: e.target.value }))}
                placeholder="修复登录页面样式问题&#10;修复数据导入失败的问题"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                优化改进
                <span className="text-xs text-gray-400 font-normal">（每行一条）</span>
              </Label>
              <Textarea
                value={formData.improvements}
                onChange={(e) => setFormData(f => ({ ...f, improvements: e.target.value }))}
                placeholder="优化列表加载速度&#10;优化用户界面交互"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? '创建中...' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑版本对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5" />
              编辑版本
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>版本号 <span className="text-red-500">*</span></Label>
                <Input
                  value={formData.version}
                  onChange={(e) => setFormData(f => ({ ...f, version: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  <Calendar className="w-4 h-4 inline mr-1" />
                  发布日期
                </Label>
                <Input
                  type="date"
                  value={formData.releaseDate}
                  onChange={(e) => setFormData(f => ({ ...f, releaseDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>标题 <span className="text-red-500">*</span></Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>版本说明</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-500" />
                新增功能
                <span className="text-xs text-gray-400 font-normal">（每行一条）</span>
              </Label>
              <Textarea
                value={formData.features}
                onChange={(e) => setFormData(f => ({ ...f, features: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Bug className="w-4 h-4 text-red-500" />
                修复Bug
                <span className="text-xs text-gray-400 font-normal">（每行一条）</span>
              </Label>
              <Textarea
                value={formData.fixes}
                onChange={(e) => setFormData(f => ({ ...f, fixes: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                优化改进
                <span className="text-xs text-gray-400 font-normal">（每行一条）</span>
              </Label>
              <Textarea
                value={formData.improvements}
                onChange={(e) => setFormData(f => ({ ...f, improvements: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingLog(null) }}>
              取消
            </Button>
            <Button onClick={handleUpdate} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
