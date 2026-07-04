"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Download,
  FileSpreadsheet,
  FileText,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { DataTable, TableField, RecordStatus, Role } from '@prisma/client'

interface DataListClientProps {
  table: DataTable & {
    fields: TableField[]
  }
  user: {
    id: number
    role: Role
  }
}

const statusMap: Record<RecordStatus, { label: string; variant: string }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  SUBMITTED: { label: '已提交', variant: 'default' },
  REVIEWED: { label: '已审核', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  ARCHIVED: { label: '已归档', variant: 'outline' },
}

export function DataListClient({ table, user }: DataListClientProps) {
  const router = useRouter()
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const listFields = table.fields.filter(f => f.showInList)

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      })
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/data/${table.name}?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTotal(data.total || 0)
      }
    } catch (err) {
      console.error('Fetch records error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [page, status])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchRecords()
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条记录吗？')) return

    try {
      const res = await fetch(`/api/data/${table.name}/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        fetchRecords()
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const handleExport = async (type: 'excel' | 'pdf') => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/export/${table.name}/${type}?${params}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${table.label}_${new Date().toISOString().slice(0, 10)}.${type === 'excel' ? 'xlsx' : 'pdf'}`
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        alert('导出失败')
      }
    } catch (err) {
      alert('导出失败')
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const canCreate = user.role === 'ADMIN' || user.role === 'MANAGER' || true

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{table.label}</h1>
          <p className="text-gray-500 mt-1">{table.description || `共 ${total} 条记录`}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">数据列表</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部状态</SelectItem>
                  {Object.entries(statusMap).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => handleExport('excel')}>
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button variant="outline" onClick={() => handleExport('pdf')}>
                <FileText className="w-4 h-4 mr-2" />
                PDF
              </Button>
              {canCreate && (
                <Button onClick={() => router.push(`/dashboard/data/${table.name}/new`)}>
                  <Plus className="w-4 h-4 mr-2" />
                  新增记录
                </Button>
              )}
            </div>
          </div>
          <form onSubmit={handleSearch} className="flex gap-2 mt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索数据..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button type="submit" variant="outline">搜索</Button>
          </form>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                {listFields.map((field) => (
                  <TableHead key={field.id}>{field.label}</TableHead>
                ))}
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={listFields.length + 4} className="text-center py-12">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : records.length > 0 ? (
                records.map((record) => {
                  const statusInfo = statusMap[record.status as RecordStatus]
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-sm">#{record.id}</TableCell>
                      {listFields.map((field) => (
                        <TableCell key={field.id}>
                          {record.data?.[field.name]?.toString().slice(0, 50) || '-'}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Badge variant={statusInfo?.variant as any}>{statusInfo?.label}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {formatDateTime(record.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/data/${table.name}/${record.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/data/${table.name}/${record.id}/edit`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(record.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={listFields.length + 4} className="text-center py-12 text-gray-500">
                    暂无数据
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                共 {total} 条记录，第 {page} / {totalPages} 页
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
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
