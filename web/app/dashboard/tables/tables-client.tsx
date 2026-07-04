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
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { TableStatus, Role } from '@prisma/client'

interface TableItem {
  id: number
  name: string
  label: string
  description: string | null
  icon: string | null
  status: TableStatus
  sortOrder: number
  createdAt: Date
  _count: {
    fields: number
    records: number
  }
}

interface TablesClientProps {
  initialTables: TableItem[]
  userRole: Role
}

export function TablesClient({ initialTables, userRole }: TablesClientProps) {
  const router = useRouter()
  const [tables, setTables] = useState<TableItem[]>(initialTables)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    description: '',
    icon: '',
  })

  const handleCreate = async () => {
    if (!formData.name || !formData.label) return

    setLoading(true)
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setDialogOpen(false)
        setFormData({ name: '', label: '', description: '', icon: '' })
        router.refresh()
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
    if (!confirm('确定要删除这个数据表吗？此操作不可恢复。')) return

    try {
      const res = await fetch(`/api/tables/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">数据表管理</h1>
          <p className="text-gray-500 mt-1">管理系统中的动态数据表</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              新建数据表
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建数据表</DialogTitle>
              <DialogDescription>
                创建一个新的数据表，之后可以添加字段。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">表名（英文标识）</Label>
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
                <Label htmlFor="description">描述（可选）</Label>
                <Input
                  id="description"
                  placeholder="数据表描述"
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">数据表列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>表名</TableHead>
                <TableHead>显示名称</TableHead>
                <TableHead>字段数</TableHead>
                <TableHead>记录数</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.length > 0 ? (
                tables.map((table) => (
                  <TableRow key={table.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Table2 className="w-4 h-4 text-gray-400" />
                        {table.name}
                      </div>
                    </TableCell>
                    <TableCell>{table.label}</TableCell>
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
                          onClick={() => router.push(`/dashboard/tables/${table.id}`)}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {userRole === 'ADMIN' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
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
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无数据表，点击右上角创建</p>
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
