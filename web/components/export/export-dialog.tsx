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
} from 'lucide-react'
import { DataTable, TableField, ExportType, ExportFormat } from '@prisma/client'

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
  format: ExportFormat
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

  useEffect(() => {
    if (open) {
      setFormat(initialFormat)
      fetchTemplates(initialFormat)
    }
  }, [open, initialFormat])

  useEffect(() => {
    if (open) {
      fetchTemplates(format)
    }
  }, [format, open])

  const fetchTemplates = async (fmt: 'EXCEL' | 'PDF') => {
    try {
      const res = await fetch(`/api/export-templates?tableId=${table.id}&format=${fmt}`)
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

  const handleExport = async () => {
    if (!selectedTemplate) {
      alert('请选择导出模板')
      return
    }
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('templateId', selectedTemplate)
      params.set('useTemplate', 'true')
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/export/${table.name}/${format === 'EXCEL' ? 'excel' : 'pdf'}?${params}`)
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
        alert('导出失败')
      }
    } catch (err) {
      alert('导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
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
                暂无该格式的模板，请先在"导出模板设计"中创建模板
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={exporting || !selectedTemplate || templates.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? '导出中...' : '导出'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
