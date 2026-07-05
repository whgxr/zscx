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
import { Switch } from '@/components/ui/switch'
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
  Shield,
  Database,
  Users,
  FileText,
  Palette,
  Activity,
  Settings2,
} from 'lucide-react'

interface Role {
  id: number
  name: string
  label: string
  description: string | null
  canManageTables: boolean
  canManageUsers: boolean
  canManagePermissions: boolean
  canManageTemplates: boolean
  canViewLogs: boolean
  canManageSettings: boolean
  isSystem: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

interface RolesClientProps {
  roles: Role[]
}

const permissionItems = [
  { key: 'canManageTables', label: '数据表管理', icon: Database },
  { key: 'canManageUsers', label: '用户管理', icon: Users },
  { key: 'canManagePermissions', label: '权限管理', icon: Shield },
  { key: 'canManageTemplates', label: '模板管理', icon: Palette },
  { key: 'canViewLogs', label: '日志查看', icon: Activity },
  { key: 'canManageSettings', label: '系统设置', icon: Settings2 },
]

export function RolesClient({ roles }: RolesClientProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    description: '',
    canManageTables: false,
    canManageUsers: false,
    canManagePermissions: false,
    canManageTemplates: false,
    canViewLogs: false,
    canManageSettings: false,
    sortOrder: 0,
  })

  const handleOpenDialog = (role?: Role) => {
    if (role) {
      setEditingRole(role)
      setFormData({
        name: role.name,
        label: role.label,
        description: role.description || '',
        canManageTables: role.canManageTables,
        canManageUsers: role.canManageUsers,
        canManagePermissions: role.canManagePermissions,
        canManageTemplates: role.canManageTemplates,
        canViewLogs: role.canViewLogs,
        canManageSettings: role.canManageSettings,
        sortOrder: role.sortOrder,
      })
    } else {
      setEditingRole(null)
      setFormData({
        name: '',
        label: '',
        description: '',
        canManageTables: false,
        canManageUsers: false,
        canManagePermissions: false,
        canManageTemplates: false,
        canViewLogs: false,
        canManageSettings: false,
        sortOrder: 0,
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.label) {
      alert('角色名称和显示名称不能为空')
      return
    }

    setLoading(true)
    try {
      if (editingRole) {
        const res = await fetch(`/api/roles/${editingRole.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!res.ok) {
          const data = await res.json()
          alert(data.message || '更新失败')
          return
        }
      } else {
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        })
        if (!res.ok) {
          const data = await res.json()
          alert(data.message || '创建失败')
          return
        }
      }
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      alert('操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (role: Role) => {
    if (!confirm(`确定要删除角色 "${role.label}" 吗？`)) return
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.message || '删除失败')
        return
      }
      router.refresh()
    } catch (err) {
      alert('删除失败')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">角色管理</h1>
          <p className="text-gray-500 mt-1">管理系统角色和权限</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              {editingRole ? '编辑角色' : '新建角色'}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingRole ? '编辑角色' : '新建角色'}</DialogTitle>
              <DialogDescription>
                {editingRole ? '编辑角色信息和权限' : '创建一个新角色并设置权限'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>角色名称</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：editor"
                  disabled={editingRole?.isSystem}
                />
              </div>
              <div className="space-y-2">
                <Label>显示名称</Label>
                <Input
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="如：编辑员"
                />
              </div>
              <div className="space-y-2">
                <Label>描述</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="角色描述"
                />
              </div>
              <div className="space-y-2">
                <Label>管理权限</Label>
                <div className="grid grid-cols-2 gap-3">
                  {permissionItems.map(item => {
                    const Icon = item.icon
                    return (
                      <div key={item.key} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4 text-gray-500" />
                          <span className="text-sm">{item.label}</span>
                        </div>
                        <Switch
                          checked={formData[item.key as keyof typeof formData] as boolean}
                          onCheckedChange={(v) => setFormData({ ...formData, [item.key]: v })}
                          disabled={editingRole?.isSystem}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {editingRole ? '保存修改' : '创建角色'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">角色列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>角色名称</TableHead>
                <TableHead>显示名称</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      {role.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {role.label}
                      {role.isSystem && (
                        <Badge variant="secondary" className="text-xs">系统</Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-xs text-gray-500 mt-1">{role.description}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {permissionItems
                        .filter(item => role[item.key as keyof Role] as boolean)
                        .map(item => (
                          <Badge key={item.key} variant="outline" className="text-xs">
                            {item.label}
                          </Badge>
                        ))}
                      {!permissionItems.some(item => role[item.key as keyof Role] as boolean) && (
                        <span className="text-xs text-gray-400">无管理权限</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {role.isSystem ? (
                      <Badge variant="secondary">系统角色</Badge>
                    ) : (
                      <Badge variant="outline">自定义</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-gray-500 text-sm">
                    {new Date(role.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDialog(role)}
                        disabled={role.isSystem}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(role)}
                        disabled={role.isSystem}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}