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
  ChevronRight,
  ChevronDown,
  Plus,
  Edit,
  Trash2,
  Folder,
  FolderOpen,
  ArrowUp,
  ArrowDown,
  LayoutDashboard,
  Table2,
  Users,
  Settings,
  Building2,
  FileBarChart,
  ShieldCheck,
  Palette,
  Activity,
  Home,
  FileText,
  Database,
  List,
  Grid,
  Tag,
  Hash,
  Star,
  Heart,
  Bookmark,
  Flag,
  Target,
  Zap,
  Clock,
  Calendar,
  Mail,
  Phone,
  MapPin,
  Image,
  File,
  Link,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Search,
  Filter,
  SortAsc,
  SortDesc,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface CategoryItem {
  id: number
  name: string
  parentId: number | null
  level: number
  sortOrder: number
  icon: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    tables: number
    children: number
  }
}

interface CategoryNode extends CategoryItem {
  children: CategoryNode[]
}

interface CategoriesClientProps {
  initialCategories: CategoryItem[]
  userRole: { name: string } | null
}

const iconOptions = [
  { name: 'Folder', component: Folder },
  { name: 'FolderOpen', component: FolderOpen },
  { name: 'LayoutDashboard', component: LayoutDashboard },
  { name: 'Table2', component: Table2 },
  { name: 'Database', component: Database },
  { name: 'FileText', component: FileText },
  { name: 'FileBarChart', component: FileBarChart },
  { name: 'List', component: List },
  { name: 'Grid', component: Grid },
  { name: 'Tag', component: Tag },
  { name: 'Hash', component: Hash },
  { name: 'Star', component: Star },
  { name: 'Heart', component: Heart },
  { name: 'Bookmark', component: Bookmark },
  { name: 'Flag', component: Flag },
  { name: 'Target', component: Target },
  { name: 'Zap', component: Zap },
  { name: 'Clock', component: Clock },
  { name: 'Calendar', component: Calendar },
  { name: 'Building2', component: Building2 },
  { name: 'Users', component: Users },
  { name: 'Settings', component: Settings },
  { name: 'ShieldCheck', component: ShieldCheck },
  { name: 'Palette', component: Palette },
  { name: 'Activity', component: Activity },
  { name: 'Home', component: Home },
  { name: 'Mail', component: Mail },
  { name: 'Phone', component: Phone },
  { name: 'MapPin', component: MapPin },
  { name: 'Image', component: Image },
  { name: 'File', component: File },
  { name: 'Link', component: Link },
  { name: 'Lock', component: Lock },
  { name: 'Unlock', component: Unlock },
  { name: 'Eye', component: Eye },
  { name: 'Search', component: Search },
  { name: 'Filter', component: Filter },
]

const iconMap: Record<string, any> = iconOptions.reduce((acc, item) => {
  acc[item.name] = item.component
  return acc
}, {} as Record<string, any>)

function buildTree(categories: CategoryItem[]): CategoryNode[] {
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

function getAllDescendants(node: CategoryNode): CategoryNode[] {
  let result: CategoryNode[] = []
  node.children.forEach(child => {
    result.push(child)
    result = result.concat(getAllDescendants(child))
  })
  return result
}

function getAvailableParents(categories: CategoryItem[], editingId?: number): CategoryItem[] {
  if (editingId) {
    const editingCat = categories.find(c => c.id === editingId)
    if (editingCat && editingCat.level === 1) {
      return categories.filter(c => c.level < 3 && c.id !== editingId)
    }
    const tree = buildTree(categories)
    const findNode = (nodes: CategoryNode[], id: number): CategoryNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children, id)
        if (found) return found
      }
      return null
    }
    const editingNode = findNode(tree, editingId)
    if (editingNode) {
      const descendants = getAllDescendants(editingNode).map(n => n.id)
      return categories.filter(c => c.level < 3 && c.id !== editingId && !descendants.includes(c.id))
    }
  }
  return categories.filter(c => c.level < 3)
}

const IconComponent = ({ name, className }: { name: string | null; className?: string }) => {
  if (!name || !iconMap[name]) return <Folder className={className || "w-4 h-4"} />
  const Icon = iconMap[name]
  return <Icon className={className || "w-4 h-4"} />
}

export function CategoriesClient({ initialCategories, userRole }: CategoriesClientProps) {
  const router = useRouter()
  const [categories, setCategories] = useState<CategoryItem[]>(initialCategories)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null)
  const [parentId, setParentId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    icon: '',
    sortOrder: 0,
  })

  const tree = buildTree(categories)
  const availableParents = getAvailableParents(categories, editingCategory?.id)

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleOpenAddDialog = (parentIdVal: number | null = null) => {
    setEditingCategory(null)
    setParentId(parentIdVal)
    setFormData({
      name: '',
      icon: '',
      sortOrder: 0,
    })
    setDialogOpen(true)
  }

  const handleOpenEditDialog = (category: CategoryItem) => {
    setEditingCategory(category)
    setParentId(category.parentId)
    setFormData({
      name: category.name,
      icon: category.icon || '',
      sortOrder: category.sortOrder,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name) {
      alert('分类名称不能为空')
      return
    }

    setLoading(true)
    try {
      const body: any = {
        name: formData.name,
        parentId: parentId,
        icon: formData.icon || null,
        sortOrder: formData.sortOrder,
      }

      let url = '/api/categories'
      let method = 'POST'

      if (editingCategory) {
        url = `/api/categories/${editingCategory.id}`
        method = 'PUT'
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = await res.json()

        if (editingCategory) {
          setCategories(prev => prev.map(cat =>
            cat.id === editingCategory.id
              ? { ...cat, ...data.category }
              : cat
          ))
        } else {
          setCategories(prev => [...prev, data.category])
        }

        setDialogOpen(false)
        setEditingCategory(null)
      } else {
        const data = await res.json()
        alert(data.message || '操作失败')
      }
    } catch (err) {
      alert('操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (category: CategoryItem) => {
    if (!confirm(`确定要删除分类 "${category.name}" 吗？`)) return

    try {
      const res = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        setCategories(prev => prev.filter(cat => cat.id !== category.id))
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const handleMoveUp = async (category: CategoryItem) => {
    const siblings = categories
      .filter(c => c.parentId === category.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const currentIndex = siblings.findIndex(c => c.id === category.id)
    if (currentIndex <= 0) return

    const prevSibling = siblings[currentIndex - 1]

    try {
      await Promise.all([
        fetch(`/api/categories/${category.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: prevSibling.sortOrder }),
        }),
        fetch(`/api/categories/${prevSibling.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: category.sortOrder }),
        }),
      ])

      setCategories(prev => prev.map(cat => {
        if (cat.id === category.id) {
          return { ...cat, sortOrder: prevSibling.sortOrder }
        }
        if (cat.id === prevSibling.id) {
          return { ...cat, sortOrder: category.sortOrder }
        }
        return cat
      }))
    } catch (err) {
      alert('移动失败')
    }
  }

  const handleMoveDown = async (category: CategoryItem) => {
    const siblings = categories
      .filter(c => c.parentId === category.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)

    const currentIndex = siblings.findIndex(c => c.id === category.id)
    if (currentIndex < 0 || currentIndex >= siblings.length - 1) return

    const nextSibling = siblings[currentIndex + 1]

    try {
      await Promise.all([
        fetch(`/api/categories/${category.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: nextSibling.sortOrder }),
        }),
        fetch(`/api/categories/${nextSibling.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: category.sortOrder }),
        }),
      ])

      setCategories(prev => prev.map(cat => {
        if (cat.id === category.id) {
          return { ...cat, sortOrder: nextSibling.sortOrder }
        }
        if (cat.id === nextSibling.id) {
          return { ...cat, sortOrder: category.sortOrder }
        }
        return cat
      }))
    } catch (err) {
      alert('移动失败')
    }
  }

  const renderTreeNode = (node: CategoryNode, depth: number = 0) => {
    const hasChildren = node.children.length > 0
    const isExpanded = expandedIds.has(node.id)
    const siblings = categories
      .filter(c => c.parentId === node.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const currentIndex = siblings.findIndex(c => c.id === node.id)

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors group",
          )}
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <IconComponent name={node.icon} className="w-5 h-5 text-primary" />

          <span className="flex-1 font-medium text-sm">{node.name}</span>

          <Badge variant="outline" className="text-xs">
            第{node.level}级
          </Badge>

          <Badge variant="secondary" className="text-xs">
            {node._count.tables} 个项目
          </Badge>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {node.level < 3 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                title="添加子分类"
                onClick={() => handleOpenAddDialog(node.id)}
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="上移"
              disabled={currentIndex <= 0}
              onClick={() => handleMoveUp(node)}
            >
              <ArrowUp className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="下移"
              disabled={currentIndex >= siblings.length - 1}
              onClick={() => handleMoveDown(node)}
            >
              <ArrowDown className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              title="编辑"
              onClick={() => handleOpenEditDialog(node)}
            >
              <Edit className="w-4 h-4" />
            </Button>

            {userRole?.name === 'ADMIN' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                title="删除"
                onClick={() => handleDelete(node)}
                disabled={node._count.children > 0 || node._count.tables > 0}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">分类管理</h1>
          <p className="text-gray-500 mt-1">管理项目的3级分类结构</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenAddDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              新建分类
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? '编辑分类' : '新建分类'}
              </DialogTitle>
              <DialogDescription>
                {editingCategory ? '编辑分类信息' : '创建一个新分类'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>分类名称</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="请输入分类名称"
                />
              </div>

              <div className="space-y-2">
                <Label>父级分类</Label>
                <Select
                  value={parentId?.toString() || ''}
                  onValueChange={(value) => setParentId(value ? parseInt(value) : null)}
                  disabled={!!editingCategory && editingCategory.level === 1 && false}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="无（作为一级分类）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">无（作为一级分类）</SelectItem>
                    {availableParents.map(cat => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}（第{cat.level}级）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  分类最多支持3级
                </p>
              </div>

              <div className="space-y-2">
                <Label>图标</Label>
                <Select
                  value={formData.icon || ''}
                  onValueChange={(value) => setFormData({ ...formData, icon: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择图标" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="">默认图标</SelectItem>
                    {iconOptions.map(icon => (
                      <SelectItem key={icon.name} value={icon.name}>
                        <div className="flex items-center gap-2">
                          <icon.component className="w-4 h-4" />
                          <span>{icon.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                />
                <p className="text-xs text-gray-500">
                  数值越小越靠前
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? '保存中...' : editingCategory ? '保存修改' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">分类树</CardTitle>
        </CardHeader>
        <CardContent>
          {tree.length > 0 ? (
            <div className="space-y-1">
              {tree.map(node => renderTreeNode(node))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>暂无分类，点击右上角创建</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
