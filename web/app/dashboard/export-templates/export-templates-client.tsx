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
  Share2,
  Check,
  Printer,
  Download,
  Settings2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { ExportType, DataTable, TableField, ExportTemplate } from '@prisma/client'

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
  userRole?: string | null
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

const categoryLabels: Record<string, string> = {
  EXPORT: '导出模板',
  PRINT: '打印模板',
}

const categoryIcons: Record<string, any> = {
  EXPORT: Download,
  PRINT: Printer,
}

// 解析逗号分隔的分类字符串为数组
function parseCategories(category: string | null | undefined): string[] {
  if (!category) return []
  return category.split(',').map(c => c.trim()).filter(Boolean)
}

// 判断模板是否包含指定分类
function hasCategory(template: ExportTemplate, cat: string): boolean {
  return parseCategories(template.category).includes(cat)
}

export function ExportTemplatesClient({ initialTemplates, tables, userRole }: ExportTemplatesClientProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateWithTable[]>(initialTemplates)
  const [activeCategory, setActiveCategory] = useState<string>('EXPORT')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<TemplateWithTable | null>(null)
  const [loading, setLoading] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [sharingTemplate, setSharingTemplate] = useState<any>(null)
  const [sharedTableIds, setSharedTableIds] = useState<number[]>([])
  const [formData, setFormData] = useState({
    name: '',
    tableId: '',
    type: 'STANDARD' as ExportType,
    categories: ['EXPORT'] as string[],
    description: '',
  })
  const [editFormData, setEditFormData] = useState({
    name: '',
    type: 'STANDARD' as ExportType,
    categories: ['EXPORT'] as string[],
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
          category: formData.categories,
          config: defaultConfig,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setDialogOpen(false)
        setFormData({ name: '', tableId: '', type: 'STANDARD', categories: ['EXPORT'], description: '' })
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

  const handleShare = (template: any) => {
    setSharingTemplate(template)
    setSharedTableIds(template.sharedTables?.map((t: any) => t.id) || [])
    setShareDialogOpen(true)
  }

  const toggleSharedTable = (tableId: number) => {
    setSharedTableIds(prev =>
      prev.includes(tableId)
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    )
  }

  const handleSaveShare = async () => {
    if (!sharingTemplate) return
    try {
      const res = await fetch(`/api/export-templates/${sharingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isShared: sharedTableIds.length > 0,
          sharedTableIds,
        }),
      })

      if (res.ok) {
        setShareDialogOpen(false)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    }
  }

  const openEditDialog = (template: TemplateWithTable) => {
    setEditingTemplate(template)
    setEditFormData({
      name: template.name,
      type: template.type as ExportType,
      categories: parseCategories(template.category),
    })
    setEditDialogOpen(true)
  }

  const handleEditSave = async () => {
    if (!editingTemplate) return
    setLoading(true)
    try {
      const res = await fetch(`/api/export-templates/${editingTemplate.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editFormData.name,
          type: editFormData.type,
          category: editFormData.categories,
        }),
      })

      if (res.ok) {
        setEditDialogOpen(false)
        setEditingTemplate(null)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '更新失败')
      }
    } catch (err) {
      alert('更新失败')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (cat: string, isEdit: boolean = false) => {
    const target = isEdit ? editFormData : formData
    const setter = isEdit ? setEditFormData : setFormData
    const current = target.categories
    const updated = current.includes(cat)
      ? current.filter(c => c !== cat)
      : [...current, cat]
    // 至少保留一个分类
    if (updated.length === 0) return
    setter({ ...target, categories: updated } as any)
  }

  const isAdmin = userRole === 'ADMIN'

  const filteredTemplates = templates.filter(t => hasCategory(t, activeCategory))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">模板管理</h1>
          <p className="text-gray-500 mt-1">可视化设计导出和打印模板</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setFormData({ name: '', tableId: '', type: 'STANDARD', categories: [activeCategory], description: '' })}>
              <Plus className="w-4 h-4 mr-2" />
              新建模板
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建模板</DialogTitle>
              <DialogDescription>
                创建一个新的模板，之后可以在设计器中自定义样式和字段。
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
                <Label>模板分类（可多选）</Label>
                <div className="flex gap-2">
                  {Object.entries(categoryLabels).map(([key, label]) => {
                    const CatIcon = categoryIcons[key]
                    const isSelected = formData.categories.includes(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleCategory(key)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                          isSelected
                            ? 'bg-primary text-white border-primary'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <CatIcon className="w-4 h-4" />
                        {label}
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    )
                  })}
                </div>
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
              <div className="space-y-2">
                <Label>模板类型</Label>
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
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">模板列表</CardTitle>
          </div>
          <div className="flex gap-1 mt-4 -mb-px border-b">
            {Object.entries(categoryLabels).map(([key, label]) => {
              const CatIcon = categoryIcons[key]
              return (
                <button
                  key={key}
                  onClick={() => setActiveCategory(key)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeCategory === key
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <CatIcon className="w-4 h-4" />
                  {label}
                  <Badge variant="secondary" className="text-xs ml-1">
                    {templates.filter(t => hasCategory(t, key)).length}
                  </Badge>
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>模板名称</TableHead>
                <TableHead>所属表</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>分类</TableHead>
                <TableHead>默认</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.length > 0 ? (
                filteredTemplates.map((template) => {
                  const TypeIcon = typeIcons[template.type] || TableIcon
                  const cats = parseCategories(template.category)
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
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>{template.table?.label || '-'}</span>
                          {(template as any).sharedTables?.length > 0 && (
                            <Badge variant="secondary" className="w-fit text-xs">
                              共享给 {(template as any).sharedTables.length} 个表
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <TypeIcon className="w-4 h-4 text-gray-400" />
                          {typeLabels[template.type]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {cats.map(cat => (
                            <Badge key={cat} variant="outline" className="text-xs">
                              {categoryLabels[cat] || cat}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleSetDefault(template.id, template.isDefault)}
                          className={template.isDefault ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}
                          disabled={template.isSystem && !isAdmin}
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
                            title="编辑模板"
                            onClick={() => router.push(`/dashboard/export-templates/${template.id}`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {(!template.isSystem || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="修改名称和类型"
                              onClick={() => openEditDialog(template)}
                            >
                              <Settings2 className="w-4 h-4" />
                            </Button>
                          )}
                          {(!template.isSystem || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="共享设置"
                              onClick={() => handleShare(template)}
                            >
                              <Share2 className="w-4 h-4" />
                            </Button>
                          )}
                          {(!template.isSystem || isAdmin) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              title="删除模板"
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
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    <Palette className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无{categoryLabels[activeCategory]}，点击右上角创建</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 编辑名称和类型对话框 */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改模板信息</DialogTitle>
            <DialogDescription>
              修改模板的名称、类型和分类
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">模板名称</Label>
              <Input
                id="edit-name"
                placeholder="模板名称"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>模板分类（可多选）</Label>
              <div className="flex gap-2">
                {Object.entries(categoryLabels).map(([key, label]) => {
                  const CatIcon = categoryIcons[key]
                  const isSelected = editFormData.categories.includes(key)
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCategory(key, true)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm transition-colors ${
                        isSelected
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <CatIcon className="w-4 h-4" />
                      {label}
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>模板类型</Label>
              <Select value={editFormData.type} onValueChange={(v: ExportType) => setEditFormData({ ...editFormData, type: v })}>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditSave} disabled={loading || !editFormData.name}>
              {loading ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>共享模板</DialogTitle>
            <DialogDescription>
              选择要共享此模板的项目表，共享后其他表也可以使用此模板导出
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label>共享给以下项目表</Label>
              <div className="border rounded-lg max-h-80 overflow-y-auto">
                {tables.map(table => (
                  <div
                    key={table.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                    onClick={() => toggleSharedTable(table.id)}
                  >
                    <div className={
                      'w-5 h-5 border rounded border-gray-300 flex items-center justify-center ' +
                      (sharedTableIds.includes(table.id)
                        ? 'bg-primary border-primary'
                        : 'bg-white')
                    }>
                      {sharedTableIds.includes(table.id) && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <span className="text-sm">{table.label}</span>
                    {sharingTemplate?.tableId === table.id && (
                      <Badge variant="secondary" className="text-xs">
                        所属表
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSaveShare}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
