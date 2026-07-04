"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Plus, 
  Edit, 
  Trash2, 
  FileSpreadsheet,
  FileText,
  Star,
  StarOff,
  Palette,
  LayoutGrid,
  Table as TableIcon,
  Layers,
  FileCheck,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ExportType, ExportFormat, DataTable, TableField, ExportTemplate } from '@prisma/client'

interface TemplateWithTable extends ExportTemplate {
  table: {
    id: number
    name: string
    label: string
  }
}

interface TableWithFields extends DataTable {
  fields: TableField[]
}

interface ExportTemplatesClientProps {
  initialTemplates: TemplateWithTable[]
  tables: TableWithFields[]
}

const typeIcons: Record<string, any> = {
  STANDARD: TableIcon,
  CARD: LayoutGrid,
  GROUPED: Layers,
  FORM: FileCheck,
}

const typeLabels: Record<string, string> = {
  STANDARD: '标准列表',
  CARD: '卡片式',
  GROUPED: '分组汇总',
  FORM: '表单式',
}

const formatLabels: Record<string, string> = {
  EXCEL: 'Excel',
  PDF: 'PDF',
}

export function ExportTemplatesClient({ initialTemplates, tables }: ExportTemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateWithTable[]>(initialTemplates)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    tableId: '',
    type: 'STANDARD' as ExportType,
    format: 'EXCEL' as ExportFormat,
    description: '',
  })

  const handleCreate = async () => {
    if (!formData.name || !formData.tableId) return

    setLoading(true)
    try {
      const table = tables.find(t => t.id.toString() === formData.tableId)
      const defaultConfig = {
        fields: table?.fields.filter(f => (f as any).showInList).map(f => ({ name: f.name, label: f.label })) || [],
        zebraStripes: true,
        showBorder: true,
        columnWidth: 15,
        fontSize: 11,
        cardsPerRow: 2,
        groupField: table?.fields[0]?.name || '',
        columnsPerRow: 2,
      }

      const res = await fetch('/api/export-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tableId: parseInt(formData.tableId),
          config: defaultConfig,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setDialogOpen(false)
        setFormData({ name: '', tableId: '', type: 'STANDARD', format: 'EXCEL', description: '' })
        router.push(`/dashboard/export-templates/${data.template.id}`)
      } else {
        const data = await res.json()
        alert(data.message || '创建失败')
      }
    } catch (err) {
      alert('创建失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个导出模板吗？')) return

    try {
      const res = await fetch(`/api/export-templates/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setTemplates(prev => prev.filter(t => t.id !== id))
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const handleSetDefault = async (id: number, isDefault: boolean) => {
    try {
      const res = await fetch(`/api/export-templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: !isDefault }),
      })

      if (res.ok) {
        router.refresh()
      }
    } catch (err) {
      console.error('Set default error:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">导出模板管理</h1>
          <p className="text-gray-500 mt-1">可视化设计 Excel 和 PDF 导出模板</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建导出模板</DialogTitle>
              <DialogDescription>
                创建一个新的导出模板，之后可以在设计器中自定义样式和字段。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">模板名称</Label>
                <Input
                  id="name"
                  placeholder="如：住户信息导出模板"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tableId">所属数据表</Label>
                <Select value={formData.tableId} onValueChange={(v) => setFormData({ ...formData, tableId: v })}>
                  <SelectTrigger id="tableId">
                    <SelectValue placeholder="选择数据表" />
                  </SelectTrigger>
                  <SelectContent>
                    {tables.map(table => (
                      <SelectItem key={table.id} value={table.id.toString()}>
                        {table.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>导出格式</Label>
                  <Select value={formData.format} onValueChange={(v: ExportFormat) => setFormData({ ...formData, format: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EXCEL">Excel (.xlsx)</SelectItem>
                      <SelectItem value="PDF">PDF (.pdf)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>导出类型</Label>
                  <Select value={formData.type} onValueChange={(v: ExportType) => setFormData({ ...formData, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">标准列表</SelectItem>
                      <SelectItem value="CARD">卡片式</SelectItem>
                      <SelectItem value="GROUPED">分组汇总</SelectItem>
                      <SelectItem value="FORM">表单式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">描述（可选）</Label>
                <Input
                  id="description"
                  placeholder="模板用途说明"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleCreate} disabled={loading || !formData.name || !formData.tableId}>
                {loading ? '创建中...' : '创建设计'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">模板列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模板名称</TableHead>
                <TableHead>所属表</TableHead>
                <TableHead>格式</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>创建者</TableHead>
                <TableHead>默认</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.length > 0 ? (
                templates.map((template) => {
                  const TypeIcon = typeIcons[template.type] || TableIcon
                  return (
                    <TableRow key={template.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Palette className="w-4 h-4 text-primary" />
                          {template.name}
                          {template.isSystem && (
                            <Badge variant="secondary" className="text-xs">系统</Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-xs text-gray-500 mt-1">{template.description}</p>
                        )}
                      </TableCell>
                      <TableCell>{template.table?.label || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {template.format === 'EXCEL' ? (
                            <FileSpreadsheet className="w-3 h-3" />
                          ) : (
                            <FileText className="w-3 h-3" />
                          )}
                          {formatLabels[template.format]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <TypeIcon className="w-4 h-4 text-gray-400" />
                          {typeLabels[template.type]}
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {template.isSystem ? '系统' : '自定义'}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleSetDefault(template.id, template.isDefault)}
                          className={template.isDefault ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}
                          disabled={template.isSystem}
                        >
                          {template.isDefault ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {formatDate(template.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/dashboard/export-templates/${template.id}`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {!template.isSystem && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDelete(template.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                    <Palette className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无导出模板，点击右上角创建</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
