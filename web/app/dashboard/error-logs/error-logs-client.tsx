"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  AlertCircle,
  AlertTriangle,
  Info,
  Search,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Copy,
  Clipboard,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

interface ErrorLogEntry {
  id: number
  userId: number | null
  level: string
  module: string
  action: string
  message: string
  stackTrace: string | null
  requestUrl: string | null
  requestMethod: string | null
  requestParams: any
  tableId: number | null
  recordId: number | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  user: {
    id: number
    username: string
    realName: string
  } | null
}

const levelIcons: Record<string, any> = {
  ERROR: AlertCircle,
  WARN: AlertTriangle,
  INFO: Info,
}

const levelColors: Record<string, string> = {
  ERROR: 'text-red-500 bg-red-50',
  WARN: 'text-amber-500 bg-amber-50',
  INFO: 'text-blue-500 bg-blue-50',
}

const levelLabels: Record<string, string> = {
  ERROR: '错误',
  WARN: '警告',
  INFO: '信息',
}

export function ErrorLogsClient() {
  const router = useRouter()
  const [logs, setLogs] = useState<ErrorLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [levelFilter, setLevelFilter] = useState('')
  const [moduleFilter, setModuleFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedLog, setExpandedLog] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (levelFilter) params.set('level', levelFilter)
      if (moduleFilter) params.set('module', moduleFilter)
      if (searchTerm) params.set('search', searchTerm)

      const res = await fetch(`/api/error-logs?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('Fetch error logs error:', err)
    } finally {
      setLoading(false)
    }
  }

  const clearLogs = async () => {
    if (!confirm('确定要清理30天前的错误日志吗？')) return
    try {
      const res = await fetch('/api/error-logs', { method: 'DELETE' })
      if (res.ok) {
        alert('清理成功')
        fetchLogs()
      }
    } catch (err) {
      alert('清理失败')
    }
  }

  const copyToClipboard = async (text: string, logId: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(logId)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (err) {
      console.error('Copy failed:', err)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [page, levelFilter, moduleFilter, searchTerm])

  const totalPages = Math.ceil(total / pageSize)

  const modules = [...new Set(logs.map(log => log.module))].sort()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/dashboard/settings')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">错误日志</h1>
            <p className="text-gray-500 mt-1">查看系统运行时错误和异常记录</p>
          </div>
        </div>
        <Button variant="outline" onClick={clearLogs} className="text-red-500 hover:text-red-600">
          <Trash2 className="w-4 h-4 mr-2" />
          清理历史日志
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              错误日志列表
            </CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索错误信息、URL、堆栈..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                  className="pl-9"
                />
              </div>
              <Select value={levelFilter} onValueChange={(v) => { setLevelFilter(v); setPage(1) }}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="全部级别" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部级别</SelectItem>
                  {Object.entries(levelLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(1) }}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="全部模块" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部模块</SelectItem>
                  {modules.map(module => (
                    <SelectItem key={module} value={module}>{module}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead className="w-20">级别</TableHead>
                <TableHead className="w-28">时间</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>模块</TableHead>
                <TableHead>操作</TableHead>
                <TableHead>错误信息</TableHead>
                <TableHead className="w-48">请求</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length > 0 ? (
                logs.map((log) => {
                  const LevelIcon = levelIcons[log.level] || AlertCircle
                  const isExpanded = expandedLog === log.id

                  return (
                    <>
                      <TableRow key={log.id} className="cursor-pointer" onClick={() => setExpandedLog(isExpanded ? null : log.id)}>
                        <TableCell className="text-gray-500">{log.id}</TableCell>
                        <TableCell>
                          <Badge className={`${levelColors[log.level]} border-none`}>
                            <LevelIcon className="w-3 h-3 mr-1" />
                            {levelLabels[log.level]}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          {log.user ? (
                            <div>
                              <div className="font-medium text-sm">{log.user.realName}</div>
                              <div className="text-xs text-gray-500">{log.user.username}</div>
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">系统</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium">{log.module}</TableCell>
                        <TableCell className="text-sm">{log.action}</TableCell>
                        <TableCell className="max-w-xs">
                          <div className="text-sm text-gray-800 truncate" title={log.message}>
                            {log.message}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {log.requestMethod && log.requestUrl ? (
                            <div>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                log.requestMethod === 'GET' ? 'bg-blue-100 text-blue-700' :
                                log.requestMethod === 'POST' ? 'bg-green-100 text-green-700' :
                                log.requestMethod === 'PUT' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {log.requestMethod}
                              </span>
                              <div className="text-xs text-gray-500 truncate mt-1" title={log.requestUrl}>
                                {log.requestUrl}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-gray-50 p-4">
                            <div className="space-y-4">
                              {log.stackTrace && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle className="w-4 h-4 text-red-500" />
                                    <span className="text-sm font-medium">堆栈跟踪</span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(log.stackTrace || '', log.id) }}
                                      className="ml-auto h-7"
                                    >
                                      {copiedId === log.id ? (
                                        <Clipboard className="w-3 h-3 text-green-500" />
                                      ) : (
                                        <Copy className="w-3 h-3" />
                                      )}
                                    </Button>
                                  </div>
                                  <pre className="text-xs text-gray-600 bg-gray-100 p-3 rounded overflow-x-auto max-h-48 overflow-y-auto">
                                    {log.stackTrace}
                                  </pre>
                                </div>
                              )}
                              {log.requestParams && Object.keys(log.requestParams).length > 0 && (
                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <Info className="w-4 h-4 text-blue-500" />
                                    <span className="text-sm font-medium">请求参数</span>
                                  </div>
                                  <pre className="text-xs text-gray-600 bg-gray-100 p-3 rounded overflow-x-auto">
                                    {JSON.stringify(log.requestParams, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.ipAddress && (
                                <div className="flex items-center gap-4 text-sm text-gray-600">
                                  <span><span className="text-gray-400">IP:</span> {log.ipAddress}</span>
                                  {log.tableId && <span><span className="text-gray-400">表ID:</span> {log.tableId}</span>}
                                  {log.recordId && <span><span className="text-gray-400">记录ID:</span> {log.recordId}</span>}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>{loading ? '加载中...' : '暂无错误日志'}</p>
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
    </div>
  )
}