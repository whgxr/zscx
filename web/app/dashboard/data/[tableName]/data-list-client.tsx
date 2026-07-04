"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  ChevronsUpDown,
  Image as ImageIcon,
  X,
} from 'lucide-react'
import { ExportDialog } from '@/components/export/export-dialog'
import { formatDateTime } from '@/lib/utils'
import { DataTable, TableField, RecordStatus, Role, FieldType } from '@prisma/client'

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
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [imageGallery, setImageGallery] = useState<{ open: boolean; images: string[]; fieldLabel: string }>({
    open: false,
    images: [],
    fieldLabel: '',
  })

  const listFields = table.fields.filter((f: any) => f.showInList)

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
    setExportDialogOpen(true)
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
                          {field.type === FieldType.UPLOAD_IMAGE ? (() => {
                            const val = record.data?.[field.name]
                            const images: string[] = Array.isArray(val) ? val : (val ? [val] : [])
                            if (images.length === 0) return <span className="text-gray-400">-</span>
                            return (
                              <div 
                                className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setImageGallery({
                                  open: true,
                                  images,
                                  fieldLabel: field.label,
                                })}
                              >
                                <div className="w-10 h-10 rounded border overflow-hidden flex-shrink-0">
                                  <img 
                                    src={images[0]} 
                                    alt="" 
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                {images.length > 1 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{images.length - 1}
                                  </Badge>
                                )}
                              </div>
                            )
                          })() : field.type === FieldType.UPLOAD_FILE ? (() => {
                            const val = record.data?.[field.name]
                            const files: string[] = Array.isArray(val) ? val : (val ? [val] : [])
                            if (files.length === 0) return <span className="text-gray-400">-</span>
                            return (
                              <div className="flex items-center gap-1">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-sm">{files.length} 个文件</span>
                              </div>
                            )
                          })() : (
                            <span className="text-sm">
                              {record.data?.[field.name]?.toString().slice(0, 50) || '-'}
                            </span>
                          )}
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
                            title="查看"
                            onClick={() => router.push(`/dashboard/data/${table.name}/${record.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="编辑"
                            onClick={() => router.push(`/dashboard/data/${table.name}/${record.id}?mode=edit`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            title="删除"
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

      <ExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        table={table}
        search={search}
        status={status}
      />

      <Dialog open={imageGallery.open} onOpenChange={(o) => setImageGallery(g => ({ ...g, open: o }))}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{imageGallery.fieldLabel} - 图片列表（共 {imageGallery.images.length} 张）</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 py-4">
            {imageGallery.images.map((url, idx) => (
              <div key={idx} className="relative group">
                <div className="aspect-square border rounded-lg overflow-hidden">
                  <img 
                    src={url} 
                    alt={`图片 ${idx + 1}`} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded hover:bg-black/80"
                  >
                    <Eye className="w-4 h-4" />
                  </a>
                  <a
                    href={url}
                    download
                    className="inline-flex items-center justify-center w-8 h-8 bg-black/60 text-white rounded hover:bg-black/80 ml-1"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
                <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                  {idx + 1} / {imageGallery.images.length}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
