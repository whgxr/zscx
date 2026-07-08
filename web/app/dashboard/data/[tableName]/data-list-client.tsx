"use client"

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Plus, 
  Search, 
  Edit, 
  Trash2, 
  Eye,
  Download,
  Upload,
  FileSpreadsheet,
  FileText,
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Image as ImageIcon,
  X,
  Settings2,
  Check,
  Printer,
} from 'lucide-react'
import { ExportDialog } from '@/components/export/export-dialog'
import { ImportDialog } from '@/components/import/import-dialog'
import { formatDateTime } from '@/lib/utils'
import { DataTable, TableField, RecordStatus, Role, FieldType } from '@prisma/client'
import JSZip from 'jszip'

interface DataListClientProps {
  table: DataTable & {
    fields: TableField[]
  }
  user: {
    id: number
    role: Role
  }
  permission?: {
    canView: boolean
    canCreate: boolean
    canEdit: boolean
    canDelete: boolean
    canExportExcel: boolean
    canExportPdf: boolean
    canPrint: boolean
    canImport: boolean
  }
}

const statusMap: Record<RecordStatus, { label: string; variant: string }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  SUBMITTED: { label: '已提交', variant: 'default' },
  REVIEWED: { label: '已审核', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  ARCHIVED: { label: '已归档', variant: 'outline' },
}

function ImageThumbnail({ src, alt = '' }: { src: string; alt?: string }) {
  const [error, setError] = useState(false)
  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-50">
        <ImageIcon className="w-5 h-5" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  )
}

export function DataListClient({ table, user, permission }: DataListClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'EXCEL' | 'PDF'>('EXCEL')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [imageGallery, setImageGallery] = useState<{ open: boolean; images: string[]; fieldLabel: string }>({
    open: false,
    images: [],
    fieldLabel: '',
  })
  const [columnSettingOpen, setColumnSettingOpen] = useState(false)
  const [visibleFields, setVisibleFields] = useState<string[]>([])
  const [recordPrintDialogOpen, setRecordPrintDialogOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<any>(null)
  const [printTemplates, setPrintTemplates] = useState<any[]>([])
  const [selectedPrintTemplate, setSelectedPrintTemplate] = useState<string>('')
  const [printPreviewUrl, setPrintPreviewUrl] = useState<string | null>(null)
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(Date.now())
  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([])

  const canEdit = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canEdit
  const canDelete = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canDelete

  const toggleSelectAll = () => {
    if (selectedRecordIds.length === records.length) {
      setSelectedRecordIds([])
    } else {
      setSelectedRecordIds(records.map(r => r.id))
    }
  }

  const toggleSelectRecord = (id: number) => {
    setSelectedRecordIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const handleBatchDelete = async () => {
    if (selectedRecordIds.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedRecordIds.length} 条记录吗？`)) return
    
    try {
      const res = await fetch(`/api/data/${table.name}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedRecordIds }),
      })
      if (res.ok) {
        setSelectedRecordIds([])
        setRefreshKey(Date.now())
      } else {
        const data = await res.json()
        alert(data.message || '批量删除失败')
      }
    } catch (err) {
      alert('批量删除失败')
    }
  }

  const defaultListFields = table.fields.filter((f: any) => f.showInList)

  useEffect(() => {
    const saved = localStorage.getItem(`table_columns_${table.name}`)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const validFields = parsed.filter((name: string) =>
          defaultListFields.some(f => f.name === name)
        )
        if (validFields.length > 0) {
          setVisibleFields(validFields)
          return
        }
      } catch {}
    }
    setVisibleFields(defaultListFields.map(f => f.name))
  }, [table.id, table.name])

  const listFields = defaultListFields.filter(f => visibleFields.includes(f.name))

  const handleSaveColumnSetting = () => {
    localStorage.setItem(`table_columns_${table.name}`, JSON.stringify(visibleFields))
    setColumnSettingOpen(false)
  }

  const toggleField = (fieldName: string) => {
    setVisibleFields(prev =>
      prev.includes(fieldName)
        ? prev.filter(n => n !== fieldName)
        : [...prev, fieldName]
    )
  }

  const resetColumns = () => {
    setVisibleFields(defaultListFields.map(f => f.name))
  }

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
  }, [page, status, refreshKey])

  useEffect(() => {
    setRefreshKey(Date.now())
  }, [pathname])

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

  const handleExport = (type: 'excel' | 'pdf') => {
    setExportFormat(type === 'excel' ? 'EXCEL' : 'PDF')
    setExportDialogOpen(true)
  }

  const getRecordImages = (record: any): { fieldLabel: string; images: string[] }[] => {
    const imageFields = table.fields.filter(f => f.type === FieldType.UPLOAD_IMAGE)
    return imageFields
      .map(field => {
        const val = record.data?.[field.name]
        const images: string[] = Array.isArray(val) ? val : (val ? [val] : [])
        return { fieldLabel: field.label, images }
      })
      .filter(f => f.images.length > 0)
  }

  const hasRecordImages = (record: any): boolean => {
    return getRecordImages(record).length > 0
  }

  const handleDownloadImages = async (record: any) => {
    const imageGroups = getRecordImages(record)
    if (imageGroups.length === 0) {
      alert('该记录没有图片')
      return
    }

    const totalImages = imageGroups.reduce((sum, g) => sum + g.images.length, 0)
    if (totalImages === 0) {
      alert('该记录没有图片')
      return
    }

    if (!confirm(`确定要下载该记录的 ${totalImages} 张图片吗？`)) {
      return
    }

    try {
      const zip = new JSZip()
      const folderName = `${table.label}_记录${record.id}_图片`
      const folder = zip.folder(folderName)
      if (!folder) return

      let imgIndex = 1
      for (const group of imageGroups) {
        const fieldFolder = folder.folder(group.fieldLabel)
        if (!fieldFolder) continue
        for (const imgUrl of group.images) {
          try {
            const response = await fetch(imgUrl)
            const blob = await response.blob()
            const ext = imgUrl.split('.').pop()?.split('?')[0] || 'jpg'
            const fileName = `${imgIndex.toString().padStart(3, '0')}.${ext}`
            fieldFolder.file(fileName, blob)
            imgIndex++
          } catch (err) {
            console.error('下载图片失败:', imgUrl, err)
          }
        }
      }

      const content = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${folderName}.zip`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('打包图片失败:', err)
      alert('打包图片失败')
    }
  }

  const handleRecordPrint = async (record: any) => {
    setSelectedRecord(record)
    setRecordPrintDialogOpen(true)
    try {
      const res = await fetch(`/api/export-templates?tableId=${table.id}`)
      if (res.ok) {
        const data = await res.json()
        const printTemplates = (data.templates || []).filter((t: any) => 
          t.category?.includes('PRINT')
        )
        setPrintTemplates(printTemplates)
        const defaultTemplate = printTemplates.find((t: any) => t.isDefault)
        if (defaultTemplate) {
          setSelectedPrintTemplate(defaultTemplate.id.toString())
        } else if (printTemplates.length > 0) {
          setSelectedPrintTemplate(printTemplates[0].id.toString())
        } else {
          setSelectedPrintTemplate('')
        }
      }
    } catch (err) {
      console.error('Fetch templates error:', err)
    }
  }

  const handlePrintPreview = async () => {
    if (!selectedPrintTemplate || !selectedRecord) {
      alert('请选择打印模板')
      return
    }
    try {
      const params = new URLSearchParams()
      params.set('templateId', selectedPrintTemplate)
      params.set('useTemplate', 'true')
      params.set('recordId', selectedRecord.id.toString())
      const res = await fetch(`/api/export/${table.name}/pdf?${params}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        setPrintPreviewUrl(url)
        setPrintPreviewOpen(true)
      } else {
        alert('预览失败')
      }
    } catch (err) {
      alert('预览失败')
    }
  }

  const handlePrint = () => {
    if (printPreviewUrl) {
      const printWindow = window.open(printPreviewUrl, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    }
  }

  const totalPages = Math.ceil(total / pageSize)
  const canCreate = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canCreate
  const canPrint = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canPrint
  const canExportExcel = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canExportExcel
  const canExportPdf = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canExportPdf
  const canImport = user.role?.name === 'ADMIN' || user.role?.name === 'MANAGER' || permission?.canImport
  const canExportAny = canExportExcel || canExportPdf

  return (
    <div className="space-y-6">
      {selectedRecordIds.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm text-gray-600">已选择 {selectedRecordIds.length} 条记录</span>
          {canDelete && (
            <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              批量删除
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setSelectedRecordIds([])}>
            取消选择
          </Button>
        </div>
      )}
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
              {canExportAny && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
                      导出
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canExportExcel && (
                      <DropdownMenuItem onClick={() => handleExport('excel')}>
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                        导出 Excel
                      </DropdownMenuItem>
                    )}
                    {canExportPdf && (
                      <DropdownMenuItem onClick={() => handleExport('pdf')}>
                        <FileText className="w-4 h-4 mr-2" />
                        导出 PDF
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {canImport && (
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  导入
                </Button>
              )}
              <Button variant="outline" onClick={() => setColumnSettingOpen(true)} title="列设置">
                <Settings2 className="w-4 h-4 mr-2" />
                列设置
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
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={records.length > 0 && selectedRecordIds.length === records.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </TableHead>
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
                  <TableCell colSpan={listFields.length + 5} className="text-center py-12">
                    加载中...
                  </TableCell>
                </TableRow>
              ) : records.length > 0 ? (
                records.map((record) => {
                  const statusInfo = statusMap[record.status as RecordStatus]
                  const isSelected = selectedRecordIds.includes(record.id)
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRecord(record.id)}
                          className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                      </TableCell>
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
                                  <ImageThumbnail src={images[0]} />
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
                          {hasRecordImages(record) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="下载图片"
                              onClick={() => handleDownloadImages(record)}
                            >
                              <ImageIcon className="w-4 h-4" />
                            </Button>
                          )}
                          {canPrint && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="打印/预览"
                              onClick={() => handleRecordPrint(record)}
                            >
                              <Printer className="w-4 h-4" />
                            </Button>
                          )}
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
        initialFormat={exportFormat}
      />

      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        table={table}
        onImportSuccess={fetchRecords}
      />

      <Dialog open={columnSettingOpen} onOpenChange={setColumnSettingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>列设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                已选择要显示的列（{visibleFields.length}/{defaultListFields.length}）
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setVisibleFields(defaultListFields.map(f => f.name))}
                >
                  全选
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const allFieldNames = defaultListFields.map(f => f.name)
                    setVisibleFields(allFieldNames.filter(name => !visibleFields.includes(name)))
                  }}
                >
                  反选
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetColumns}
                >
                  重置
                </Button>
              </div>
            </div>
            <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
              {defaultListFields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
                  onClick={() => toggleField(field.name)}
                >
                  <div className={
                    'w-5 h-5 border rounded border-gray-300 flex items-center justify-center ' +
                    (visibleFields.includes(field.name)
                      ? 'bg-primary border-primary'
                      : 'bg-white')
                  }>
                    {visibleFields.includes(field.name) && (
                      <Check className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                  <span className="text-sm">{field.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setColumnSettingOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveColumnSetting}>
              确定
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      <Dialog open={recordPrintDialogOpen} onOpenChange={setRecordPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>打印/预览</DialogTitle>
            <DialogDescription>
              选择打印模板
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div>
              <Label>选择模板</Label>
              <div className="flex gap-2 mt-2">
                <Select value={selectedPrintTemplate} onValueChange={setSelectedPrintTemplate}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择打印模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {printTemplates.length > 0 ? (
                      printTemplates.map((template: any) => (
                        <SelectItem key={template.id} value={template.id.toString()}>
                          <div className="flex items-center gap-2">
                            <span>{template.name}</span>
                            {template.isSystem && <span className="text-xs text-gray-400">(系统)</span>}
                            {template.isDefault && <span className="text-xs text-blue-500">(默认)</span>}
                          </div>
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="__empty__" disabled>
                        暂无打印模板
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {printTemplates.length === 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  暂无打印模板，请先在"模板管理"中创建打印模板
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordPrintDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={handlePrintPreview}
              disabled={!selectedPrintTemplate || printTemplates.length === 0}
            >
              <Eye className="w-4 h-4 mr-2" />
              预览
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={printPreviewOpen} onOpenChange={setPrintPreviewOpen}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>打印预览</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" />
                  打印
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (printPreviewUrl && selectedRecord) {
                      const a = document.createElement('a')
                      a.href = printPreviewUrl
                      a.download = `${table.label}_记录${selectedRecord.id}.pdf`
                      a.click()
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {printPreviewUrl && (
              <iframe
                src={printPreviewUrl}
                className="w-full h-full border rounded"
                title="打印预览"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
