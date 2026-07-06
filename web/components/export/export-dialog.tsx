"use client"

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FileSpreadsheet,
  FileText,
  Download,
  Eye,
  Printer,
} from 'lucide-react'
import { DataTable, TableField, ExportType, TemplateCategory } from '@prisma/client'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: DataTable & {
    fields: TableField[]
  }
  search?: string
  status?: string
  initialFormat?: 'EXCEL' | 'PDF'
}

interface ExportTemplate {
  id: number
  name: string
  type: ExportType
  category: TemplateCategory
  description: string | null
  config: any
  isDefault: boolean
  isSystem: boolean
}

export function ExportDialog({ open, onOpenChange, table, search, status, initialFormat = 'EXCEL' }: ExportDialogProps) {
  const [format, setFormat] = useState<'EXCEL' | 'PDF'>(initialFormat)
  const [templates, setTemplates] = useState<ExportTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [exporting, setExporting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState<{ headers: string[]; rows: any[]; tableName?: string; total?: number } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    if (open) {
      setFormat(initialFormat)
      fetchTemplates()
    }
  }, [open])

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/export-templates?tableId=${table.id}&category=EXPORT`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
        const defaultTemplate = data.templates?.find((t: ExportTemplate) => t.isDefault)
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate.id.toString())
        } else if (data.templates?.length > 0) {
          setSelectedTemplate(data.templates[0].id.toString())
        } else {
          setSelectedTemplate('')
        }
      }
    } catch (err) {
      console.error('Fetch templates error:', err)
    }
  }

  const buildExportUrl = () => {
    const params = new URLSearchParams()
    params.set('templateId', selectedTemplate)
    params.set('useTemplate', 'true')
    if (search) params.set('search', search)
    if (status) params.set('status', status)
    return `/api/export/${table.name}/${format === 'EXCEL' ? 'excel' : 'pdf'}?${params}`
  }

  const handleExport = async () => {
    if (!selectedTemplate) {
      alert('请选择导出模板')
      return
    }
    setExporting(true)
    try {
      const res = await fetch(buildExportUrl())
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const template = templates.find(t => t.id.toString() === selectedTemplate)
        a.download = `${table.label}_${template?.name || '导出'}_${new Date().toISOString().slice(0, 10)}.${format === 'EXCEL' ? 'xlsx' : 'pdf'}`
        a.click()
        window.URL.revokeObjectURL(url)
        onOpenChange(false)
      } else {
        let errorMsg = '导出失败'
        try {
          const json = await res.json()
          if (json.message) errorMsg = json.message
        } catch (e) {
          errorMsg = `导出失败 (${res.status})`
        }
        alert(errorMsg)
      }
    } catch (err: any) {
      alert(`导出失败: ${err.message || err}`)
    } finally {
      setExporting(false)
    }
  }

  const handlePreview = async () => {
    if (!selectedTemplate) {
      alert('请选择导出模板')
      return
    }
    setPreviewLoading(true)
    try {
      const url = buildExportUrl() + '&preview=true'
      if (format === 'EXCEL') {
        const previewApiUrl = `/api/export/${table.name}/preview?${new URLSearchParams({
          templateId: selectedTemplate,
          useTemplate: 'true',
          search: search || '',
          status: status || '',
        })}`
        const res = await fetch(previewApiUrl)
        if (res.ok) {
          const data = await res.json()
          setPreviewData(data)
          setPreviewUrl(null)
          setPreviewOpen(true)
        } else {
          let errorMsg = '预览失败'
          try {
            const json = await res.json()
            if (json.message) errorMsg = json.message
          } catch (e) {
            errorMsg = `预览失败 (${res.status})`
          }
          alert(errorMsg)
        }
      } else {
        const res = await fetch(url)
        if (res.ok) {
          const blob = await res.blob()
          const blobUrl = window.URL.createObjectURL(blob)
          setPreviewUrl(blobUrl)
          setPreviewData(null)
          setPreviewOpen(true)
        } else {
          let errorMsg = '预览失败'
          try {
            const json = await res.json()
            if (json.message) errorMsg = json.message
          } catch (e) {
            errorMsg = `预览失败 (${res.status})`
          }
          alert(errorMsg)
        }
      }
    } catch (err: any) {
      alert(`预览失败: ${err.message || err}`)
    } finally {
      setPreviewLoading(false)
    }
  }

  const handlePrint = () => {
    if (previewUrl) {
      const printWindow = window.open(previewUrl, '_blank')
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>导出数据</DialogTitle>
            <DialogDescription>
              选择导出格式和模板
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div>
              <Label>导出格式</Label>
              <div className="flex gap-2 mt-2">
                <Button
                  variant={format === 'EXCEL' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setFormat('EXCEL')}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Excel
                </Button>
                <Button
                  variant={format === 'PDF' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setFormat('PDF')}
                >
                  <FileText className="w-4 h-4 mr-2" />
                  PDF
                </Button>
              </div>
            </div>

            <div>
              <Label>选择模板</Label>
              <div className="flex gap-2 mt-2">
                <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择导出模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.length > 0 ? (
                      templates.map(template => (
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
                        暂无模板，请先创建导出模板
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              {templates.length === 0 && (
                <p className="text-xs text-amber-600 mt-2">
                  暂无导出模板，请先在"模板管理"中创建导出模板
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={exporting || !selectedTemplate || templates.length === 0}
              >
                <Eye className="w-4 h-4 mr-2" />
                预览
              </Button>
              <Button onClick={handleExport} disabled={exporting || !selectedTemplate || templates.length === 0}>
                <Download className="w-4 h-4 mr-2" />
                {exporting ? '导出中...' : '导出'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{format === 'EXCEL' ? 'Excel 预览' : 'PDF 预览'}{previewData?.tableName ? ` - ${previewData.tableName}` : ''}</span>
              <div className="flex gap-2">
                {format === 'PDF' && (
                  <Button variant="outline" size="sm" onClick={handlePrint}>
                    <Printer className="w-4 h-4 mr-2" />
                    打印
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" />
                  下载
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {previewLoading && (
              <div className="flex items-center justify-center h-full text-gray-500">
                加载中...
              </div>
            )}
            {!previewLoading && format === 'EXCEL' && previewData && (
              <div className="p-2">
                <div className="text-sm text-gray-500 mb-2">
                  共 {previewData.total} 条记录（预览前20条）
                </div>
                <div className="overflow-auto border rounded">
                  <table className="w-full text-sm">
                    <thead className="bg-blue-500 text-white sticky top-0">
                      <tr>
                        {previewData.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap border-r border-blue-400 last:border-r-0">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((row, ri) => (
                        <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          {row.map((cell: string, ci: number) => (
                            <td key={ci} className="px-3 py-2 border-b border-gray-200 whitespace-nowrap max-w-xs truncate">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!previewLoading && format === 'PDF' && previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full border rounded"
                title="预览"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
