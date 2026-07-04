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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Switch } from '@/components/ui/switch'
import {
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  Table,
  Layers,
  FileCheck,
  Save,
  Download,
  Trash2,
  GripVertical,
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

const exportTypes = [
  { value: 'STANDARD', label: '标准列表', icon: Table, description: '传统行列表格格式' },
  { value: 'CARD', label: '卡片式', icon: LayoutGrid, description: '每条记录一个卡片' },
  { value: 'GROUPED', label: '分组汇总', icon: Layers, description: '按字段分组显示' },
  { value: 'FORM', label: '表单式', icon: FileCheck, description: '每条记录一个表单页' },
]

export function ExportDialog({ open, onOpenChange, table, search, status }: ExportDialogProps) {
  const [format, setFormat] = useState<'EXCEL' | 'PDF'>('EXCEL')
  const [type, setType] = useState<ExportType>('STANDARD')
  const [selectedFields, setSelectedFields] = useState<string[]>([])
  const [templates, setTemplates] = useState<ExportTemplate[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [config, setConfig] = useState<Record<string, any>>({
    zebraStripes: true,
    showBorder: true,
    columnWidth: 15,
    fontSize: 11,
    cardsPerRow: 2,
    groupField: '',
    columnsPerRow: 2,
  })

  const listFields = table.fields.filter((f: any) => f.showInList)

  useEffect(() => {
    if (open && listFields.length > 0) {
      setSelectedFields(listFields.map(f => f.name))
      setConfig(prev => ({
        ...prev,
        groupField: listFields[0]?.name || '',
      }))
      fetchTemplates()
    }
  }, [open, table.id])

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/export-templates?tableId=${table.id}&format=${format}`)
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || [])
        const defaultTemplate = data.templates?.find((t: ExportTemplate) => t.isDefault)
        if (defaultTemplate) {
          setSelectedTemplate(defaultTemplate.id.toString())
          applyTemplate(defaultTemplate)
        }
      }
    } catch (err) {
      console.error('Fetch templates error:', err)
    }
  }

  useEffect(() => {
    if (open) {
      fetchTemplates()
    }
  }, [format, open])

  const applyTemplate = (template: ExportTemplate) => {
    setType(template.type)
    if (template.config?.fields) {
      setSelectedFields(template.config.fields.map((f: any) => f.name))
    }
    if (template.config) {
      setConfig(prev => ({ ...prev, ...template.config }))
    }
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)
    const template = templates.find(t => t.id.toString() === templateId)
    if (template) {
      applyTemplate(template)
    }
  }

  const toggleField = (fieldName: string) => {
    setSelectedFields(prev =>
      prev.includes(fieldName)
        ? prev.filter(f => f !== fieldName)
        : [...prev, fieldName]
    )
  }

  const moveField = (fieldName: string, direction: 'up' | 'down') => {
    setSelectedFields(prev => {
      const index = prev.indexOf(fieldName)
      if (index === -1) return prev
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= prev.length) return prev
      const newFields = [...prev]
      newFields.splice(index, 1)
      newFields.splice(newIndex, 0, fieldName)
      return newFields
    })
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set('type', type)
      params.set('fields', selectedFields.join(','))
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      if (selectedTemplate) params.set('templateId', selectedTemplate)

      params.set('zebraStripes', config.zebraStripes.toString())
      params.set('showBorder', config.showBorder.toString())

      const res = await fetch(`/api/export/${table.name}/${format === 'EXCEL' ? 'excel' : 'pdf'}?${params}`)
      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${table.label}_${type}_${new Date().toISOString().slice(0, 10)}.${format === 'EXCEL' ? 'xlsx' : 'pdf'}`
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

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      alert('请输入模板名称')
      return
    }
    setSavingTemplate(true)
    try {
      const res = await fetch('/api/export-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId: table.id,
          name: templateName,
          type,
          format,
          config: {
            ...config,
            fields: selectedFields.map(name => ({ name })),
          },
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(prev => [...prev, data.template])
        setSelectedTemplate(data.template.id.toString())
        setTemplateName('')
        setShowSaveTemplate(false)
      } else {
        alert('保存模板失败')
      }
    } catch (err) {
      alert('保存模板失败')
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (templateId: number) => {
    if (!confirm('确定要删除这个模板吗？')) return
    try {
      const res = await fetch(`/api/export-templates/${templateId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== templateId))
        if (selectedTemplate === templateId.toString()) {
          setSelectedTemplate('')
        }
      }
    } catch (err) {
      console.error('Delete template error:', err)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>导出数据</DialogTitle>
          <DialogDescription>
            选择导出格式和样式，自定义要导出的字段
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          <div className="flex gap-4">
            <div className="flex-1">
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
          </div>

          {templates.length > 0 && (
            <div>
              <Label>选择模板</Label>
              <div className="flex gap-2 mt-2">
                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择已保存的模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span>
                            {template.name}
                            {template.isSystem && <span className="text-xs text-gray-400 ml-2">(系统)</span>}
                            {template.isDefault && <span className="text-xs text-blue-500 ml-2">(默认)</span>}
                          </span>
                          {!template.isSystem && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteTemplate(template.id)
                              }}
                              className="text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <Tabs defaultValue="type" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="type">导出类型</TabsTrigger>
              <TabsTrigger value="fields">选择字段</TabsTrigger>
              <TabsTrigger value="style">样式设置</TabsTrigger>
            </TabsList>

            <TabsContent value="type" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                {exportTypes.map(exportType => {
                  const Icon = exportType.icon
                  return (
                    <button
                      key={exportType.value}
                      onClick={() => setType(exportType.value as ExportType)}
                      className={`p-4 border rounded-lg text-left transition-all ${
                        type === exportType.value
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`p-2 rounded-lg ${
                          type === exportType.value ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="font-medium">{exportType.label}</span>
                      </div>
                      <p className="text-sm text-gray-500">{exportType.description}</p>
                    </button>
                  )
                })}
              </div>
            </TabsContent>

            <TabsContent value="fields" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <Label>选择要导出的字段（{selectedFields.length}个）</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFields(listFields.map(f => f.name))}
                  >
                    全选
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedFields([])}
                  >
                    清空
                  </Button>
                </div>
              </div>
              <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                {selectedFields.map((fieldName, index) => {
                  const field = table.fields.find(f => f.name === fieldName)
                  if (!field) return null
                  return (
                    <div
                      key={fieldName}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                    >
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(fieldName)}
                        onChange={() => toggleField(fieldName)}
                        className="w-4 h-4"
                      />
                      <span className="flex-1">{field.label}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => moveField(fieldName, 'up')}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={index === selectedFields.length - 1}
                          onClick={() => moveField(fieldName, 'down')}
                        >
                          ↓
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {table.fields.filter(f => !selectedFields.includes(f.name)).map(field => (
                  <div
                    key={field.name}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                  >
                    <GripVertical className="w-4 h-4 text-gray-300" />
                    <input
                      type="checkbox"
                      checked={false}
                      onChange={() => toggleField(field.name)}
                      className="w-4 h-4"
                    />
                    <span className="flex-1 text-gray-500">{field.label}</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="style" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="zebraStripes">斑马纹</Label>
                    <Switch
                      id="zebraStripes"
                      checked={config.zebraStripes}
                      onCheckedChange={(checked) => setConfig(prev => ({ ...prev, zebraStripes: checked }))}
                    />
                  </div>
                  <p className="text-xs text-gray-500">交替行背景色</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="showBorder">显示边框</Label>
                    <Switch
                      id="showBorder"
                      checked={config.showBorder}
                      onCheckedChange={(checked) => setConfig(prev => ({ ...prev, showBorder: checked }))}
                    />
                  </div>
                  <p className="text-xs text-gray-500">显示表格边框线</p>
                </div>
              </div>

              {type === 'CARD' && (
                <div className="space-y-2">
                  <Label htmlFor="cardsPerRow">每行卡片数</Label>
                  <Select
                    value={config.cardsPerRow.toString()}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, cardsPerRow: parseInt(v) }))}
                  >
                    <SelectTrigger id="cardsPerRow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1列</SelectItem>
                      <SelectItem value="2">2列</SelectItem>
                      <SelectItem value="3">3列</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {type === 'GROUPED' && (
                <div className="space-y-2">
                  <Label htmlFor="groupField">分组字段</Label>
                  <Select
                    value={config.groupField}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, groupField: v }))}
                  >
                    <SelectTrigger id="groupField">
                      <SelectValue placeholder="选择分组字段" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedFields.map(fieldName => {
                        const field = table.fields.find(f => f.name === fieldName)
                        return field ? (
                          <SelectItem key={fieldName} value={fieldName}>
                            {field.label}
                          </SelectItem>
                        ) : null
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {type === 'FORM' && (
                <div className="space-y-2">
                  <Label htmlFor="columnsPerRow">每行列数</Label>
                  <Select
                    value={config.columnsPerRow.toString()}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, columnsPerRow: parseInt(v) }))}
                  >
                    <SelectTrigger id="columnsPerRow">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1列</SelectItem>
                      <SelectItem value="2">2列</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="pt-4 border-t">
                {!showSaveTemplate ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowSaveTemplate(true)}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    保存为模板
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="templateName">模板名称</Label>
                      <Input
                        id="templateName"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        placeholder="输入模板名称"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveTemplate}
                        disabled={savingTemplate || !templateName.trim()}
                        className="flex-1"
                      >
                        {savingTemplate ? '保存中...' : '保存模板'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowSaveTemplate(false)
                          setTemplateName('')
                        }}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleExport} disabled={exporting || selectedFields.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            {exporting ? '导出中...' : '导出'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
