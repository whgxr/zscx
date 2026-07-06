"use client"

import { useState, useMemo } from 'react'
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
  Table2, 
  Settings,
  Database,
  FileText,
  Copy,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Layers,
  Upload,
} from 'lucide-react'
import { formatDate, cn } from '@/lib/utils'
import { TableStatus, Role, TableField } from '@prisma/client'
import { ImportDialog } from '@/components/import/import-dialog'

interface TableItem {
  id: number
  name: string
  label: string
  description: string | null
  icon: string | null
  categoryId: number | null
  category: {
    id: number
    name: string
  } | null
  status: TableStatus
  sortOrder: number
  createdAt: Date
  _count: {
    fields: number
    records: number
  }
}

interface CategoryItem {
  id: number
  name: string
  parentId: number | null
  level: number
  sortOrder: number
  icon: string | null
  _count: {
    tables: number
  }
}

interface CategoryNode extends CategoryItem {
  children: CategoryNode[]
}

interface TablesClientProps {
  initialTables: TableItem[]
  initialCategories: CategoryItem[]
  userRole: { name: string } | null
}

function buildCategoryTree(categories: CategoryItem[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>()
  const roots: CategoryNode[] = []

  categories.forEach(cat => {
    map.set(cat.id, { ...cat, children: [] })
  })

  categories.forEach(cat => {
    const node = map.get(cat.id)!
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortNodes = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder)
    nodes.forEach(node => sortNodes(node.children))
  }
  sortNodes(roots)

  return roots
}

function getCategoryAndDescendantIds(node: CategoryNode): number[] {
  let ids = [node.id]
  node.children.forEach(child => {
    ids = ids.concat(getCategoryAndDescendantIds(child))
  })
  return ids
}

export function TablesClient({ initialTables, initialCategories, userRole }: TablesClientProps) {
  const router = useRouter()
  const [tables, setTables] = useState<TableItem[]>(initialTables)
  const [categories] = useState<CategoryItem[]>(initialCategories)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null | 'all' | 'uncategorized'>('all')
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<number>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    description: '',
    icon: '',
    categoryId: '',
  })
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false)
  const [cloneLoading, setCloneLoading] = useState(false)
  const [cloneSource, setCloneSource] = useState<TableItem | null>(null)
  const [cloneForm, setCloneForm] = useState({
    name: '',
    label: '',
    description: '',
    cloneFields: true,
  })
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importTable, setImportTable] = useState<any>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editLoading, setEditLoading] = useState(false)
  const [editingTable, setEditingTable] = useState<TableItem | null>(null)
  const [editFormData, setEditFormData] = useState({
    name: '',
    label: '',
    description: '',
    icon: '',
    categoryId: '',
  })

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories])

  const filteredTables = useMemo(() => {
    if (selectedCategoryId === 'all') return tables
    if (selectedCategoryId === 'uncategorized') return tables.filter(t => !t.categoryId)
    
    const findNode = (nodes: CategoryNode[], id: number): CategoryNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }
    const selectedNode = findNode(categoryTree, selectedCategoryId as number)
    if (!selectedNode) return tables

    const categoryIds = getCategoryAndDescendantIds(selectedNode)
    return tables.filter(t => t.categoryId && categoryIds.includes(t.categoryId))
  }, [tables, selectedCategoryId, categoryTree])

  const toggleCategoryExpand = (id: number) => {
    setExpandedCategoryIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!formData.name || !formData.label) return

    setLoading(true)
    try {
      const body: any = {
        ...formData,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
      }

      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        setTables(prev => [...prev, data.table])
        setDialogOpen(false)
        setFormData({ name: '', label: '', description: '', icon: '', categoryId: '' })
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
    if (!confirm('确定要删除这个项目吗？此操作不可恢复。')) return

    try {
      const res = await fetch(`/api/tables/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setTables(prev => prev.filter(t => t.id !== id))
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const openCloneDialog = (table: TableItem) => {
    setCloneSource(table)
    setCloneForm({
      name: table.name + '_copy',
      label: table.label + ' - 副本',
      description: table.description || '',
      cloneFields: true,
    })
    setCloneDialogOpen(true)
  }

  const openImportDialog = async (table: TableItem) => {
    try {
      const res = await fetch(`/api/tables/${table.id}`)
      if (res.ok) {
        const data = await res.json()
        setImportTable(data.table)
        setImportDialogOpen(true)
      } else {
        alert('加载表信息失败')
      }
    } catch (err) {
      alert('加载表信息失败')
    }
  }

  const openEditDialog = (table: TableItem) => {
    setEditingTable(table)
    setEditFormData({
      name: table.name,
      label: table.label,
      description: table.description || '',
      icon: table.icon || '',
      categoryId: table.categoryId ? table.categoryId.toString() : '',
    })
    setEditDialogOpen(true)
  }

  const handleEdit = async () => {
    if (!editingTable || !editFormData.name || !editFormData.label) return

    setEditLoading(true)
    try {
      const body: any = {
        ...editFormData,
        categoryId: editFormData.categoryId ? parseInt(editFormData.categoryId) : null,
      }

      const res = await fetch(`/api/tables/${editingTable.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()
        setTables(prev => prev.map(t => t.id === editingTable.id ? data.table : t))
        setEditDialogOpen(false)
        setEditingTable(null)
      } else {
        const data = await res.json()
        alert(data.message || '更新失败')
      }
    } catch (err) {
      alert('更新失败')
    } finally {
      setEditLoading(false)
    }
  }

  const handleClone = async () => {
    if (!cloneSource || !cloneForm.name || !cloneForm.label) return

    setCloneLoading(true)
    try {
      const res = await fetch(`/api/tables/${cloneSource.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cloneForm),
      })

      if (res.ok) {
        const data = await res.json()
        setTables(prev => [...prev, data.table])
        setCloneDialogOpen(false)
      } else {
        const data = await res.json()
        alert(data.message || '复制失败')
      }
    } catch (err) {
      alert('复制失败')
    } finally {
      setCloneLoading(false)
    }
  }

  const statusColor: Record<TableStatus, string> = {
    ACTIVE: 'success',
    ARCHIVED: 'secondary',
    DRAFT: 'warning',
  }

  const statusText: Record<TableStatus, string> = {
    ACTIVE: '启用',
    ARCHIVED: '已归档',
    DRAFT: '草稿',
  }

  const renderCategoryNode = (node: CategoryNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedCategoryIds.has(node.id)
    const isSelected = selectedCategoryId === node.id

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
            isSelected
              ? "bg-primary/10 text-primary font-medium"
              : "hover:bg-gray-100 text-gray-700"
          )}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => setSelectedCategoryId(node.id)}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleCategoryExpand(node.id)
              }}
              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {node.icon ? (
            <span className="w-4 h-4 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </span>
          ) : (
            <Folder className="w-4 h-4" />
          )}

          <span className="flex-1 text-sm truncate">{node.name}</span>

          <Badge variant="outline" className="text-xs">
            {node._count.tables}
          </Badge>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderCategoryNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const uncategorizedCount = tables.filter(t => !t.categoryId).length

  return (
    <div className="flex gap-6">
      <div className="w-64 flex-shrink-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">分类筛选</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                  selectedCategoryId === 'all'
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-gray-100 text-gray-700"
                )}
                onClick={() => setSelectedCategoryId('all')}
              >
                <Database className="w-4 h-4" />
                <span className="flex-1 text-sm">全部项目</span>
                <Badge variant="outline" className="text-xs">
                  {tables.length}
                </Badge>
              </div>

              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
                  selectedCategoryId === 'uncategorized'
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-gray-100 text-gray-700"
                )}
                onClick={() => setSelectedCategoryId('uncategorized')}
              >
                <FileText className="w-4 h-4" />
                <span className="flex-1 text-sm">未分类</span>
                <Badge variant="outline" className="text-xs">
                  {uncategorizedCount}
                </Badge>
              </div>

              {categoryTree.length > 0 && (
                <div className="pt-2 mt-2 border-t">
                  {categoryTree.map(node => renderCategoryNode(node))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">项目管理</h1>
            <p className="text-gray-500 mt-1">
              {selectedCategoryId === 'all' && '管理系统中的所有项目数据表'}
              {selectedCategoryId === 'uncategorized' && '未分类的项目数据表'}
              {typeof selectedCategoryId === 'number' && `分类下的项目数据表`}
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                新建项目
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>新建项目</DialogTitle>
                <DialogDescription>
                  创建一个新项目，之后可以添加字段。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">项目名（英文标识）</Label>
                  <Input
                    id="name"
                    placeholder="如：household_info"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    只能包含字母、数字和下划线，且以字母开头
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">显示名称</Label>
                  <Input
                    id="label"
                    placeholder="如：住户信息表"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">所属分类</Label>
                  <Select
                    value={formData.categoryId}
                    onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择分类（可选）" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">无分类</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id.toString()}>
                          {'　'.repeat(cat.level - 1)}{cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">描述（可选）</Label>
                  <Input
                    id="description"
                    placeholder="项目描述"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon">图标（可选）</Label>
                  <Input
                    id="icon"
                    placeholder="图标名称"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreate} disabled={loading}>
                  {loading ? '创建中...' : '创建'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>复制项目</DialogTitle>
              <DialogDescription>
                基于 "{cloneSource?.label}" 创建新项目
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="clone-name">项目名（英文标识）</Label>
                <Input
                  id="clone-name"
                  placeholder="如：household_info_copy"
                  value={cloneForm.name}
                  onChange={(e) => setCloneForm({ ...cloneForm, name: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  只能包含字母、数字和下划线，且以字母开头
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clone-label">显示名称</Label>
                <Input
                  id="clone-label"
                  placeholder="如：住户信息表 - 副本"
                  value={cloneForm.label}
                  onChange={(e) => setCloneForm({ ...cloneForm, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clone-description">描述（可选）</Label>
                <Input
                  id="clone-description"
                  placeholder="项目描述"
                  value={cloneForm.description}
                  onChange={(e) => setCloneForm({ ...cloneForm, description: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="clone-fields"
                  checked={cloneForm.cloneFields}
                  onChange={(e) => setCloneForm({ ...cloneForm, cloneFields: e.target.checked })}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <Label htmlFor="clone-fields" className="cursor-pointer">同时复制字段结构</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCloneDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleClone} disabled={cloneLoading || !cloneForm.name || !cloneForm.label}>
                {cloneLoading ? '复制中...' : '复制'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">项目列表</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>项目名</TableHead>
                  <TableHead>显示名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>字段数</TableHead>
                  <TableHead>记录数</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTables.length > 0 ? (
                  filteredTables.map((table) => (
                    <TableRow key={table.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Table2 className="w-4 h-4 text-gray-400" />
                          {table.name}
                        </div>
                      </TableCell>
                      <TableCell>{table.label}</TableCell>
                      <TableCell>
                        {table.category ? (
                          <Badge variant="outline">{table.category.name}</Badge>
                        ) : (
                          <span className="text-gray-400 text-sm">未分类</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Settings className="w-4 h-4 text-gray-400" />
                          {table._count.fields}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4 text-gray-400" />
                          {table._count.records}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusColor[table.status] as any}>
                          {statusText[table.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-500">
                        {formatDate(table.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="编辑项目"
                            onClick={() => openEditDialog(table)}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="字段设计"
                            onClick={() => router.push(`/dashboard/tables/${table.id}`)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openCloneDialog(table)}
                            title="复制项目"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {(userRole?.name === 'ADMIN' || userRole?.name === 'MANAGER') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openImportDialog(table)}
                              title="导入数据"
                            >
                              <Upload className="w-4 h-4" />
                            </Button>
                          )}
                          {userRole?.name === 'ADMIN' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              title="删除项目"
                              onClick={() => handleDelete(table.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-gray-500">
                      <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>暂无项目</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {importTable && (
          <ImportDialog
            open={importDialogOpen}
            onOpenChange={setImportDialogOpen}
            table={importTable}
            onImportSuccess={() => router.refresh()}
          />
        )}

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑项目</DialogTitle>
              <DialogDescription>
                修改项目的基本信息和分类
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">项目名（英文标识）</Label>
                <Input
                  id="edit-name"
                  placeholder="如：household_info"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                />
                <p className="text-xs text-gray-500">
                  只能包含字母、数字和下划线，且以字母开头
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-label">显示名称</Label>
                <Input
                  id="edit-label"
                  placeholder="如：住户信息表"
                  value={editFormData.label}
                  onChange={(e) => setEditFormData({ ...editFormData, label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">所属分类</Label>
                <Select
                  value={editFormData.categoryId}
                  onValueChange={(value) => setEditFormData({ ...editFormData, categoryId: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择分类（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">无分类</SelectItem>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {'　'.repeat(cat.level - 1)}{cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-description">描述（可选）</Label>
                <Input
                  id="edit-description"
                  placeholder="项目描述"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-icon">图标（可选）</Label>
                <Input
                  id="edit-icon"
                  placeholder="图标名称"
                  value={editFormData.icon}
                  onChange={(e) => setEditFormData({ ...editFormData, icon: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleEdit} disabled={editLoading}>
                {editLoading ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
