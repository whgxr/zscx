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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  Users,
  Shield,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { Role, UserStatus } from '@prisma/client'

interface UserItem {
  id: number
  username: string
  realName: string
  phone: string | null
  email: string | null
  role: Role
  status: UserStatus
  createdAt: Date
}

interface UsersClientProps {
  initialUsers: UserItem[]
  currentUserRole: Role
}

const roleLabels: Record<Role, string> = {
  ADMIN: '超级管理员',
  MANAGER: '管理员',
  USER: '录入员',
  VIEWER: '查看员',
}

export function UsersClient({ initialUsers, currentUserRole }: UsersClientProps) {
  const router = useRouter()
  const [users, setUsers] = useState<UserItem[]>(initialUsers)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    realName: '',
    phone: '',
    email: '',
    role: 'USER' as Role,
  })

  const openCreateDialog = () => {
    setEditingUser(null)
    setFormData({
      username: '',
      password: '',
      realName: '',
      phone: '',
      email: '',
      role: 'USER',
    })
    setDialogOpen(true)
  }

  const openEditDialog = (user: UserItem) => {
    setEditingUser(user)
    setFormData({
      username: user.username,
      password: '',
      realName: user.realName,
      phone: user.phone || '',
      email: user.email || '',
      role: user.role,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users'
      const method = editingUser ? 'PUT' : 'POST'

      const body: any = { ...formData }
      if (editingUser && !formData.password) {
        delete body.password
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setDialogOpen(false)
        router.refresh()
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

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个用户吗？')) return

    try {
      const res = await fetch(`/api/users/${id}`, {
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

  const toggleStatus = async (user: UserItem) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
        }),
      })
      if (res.ok) {
        router.refresh()
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">用户管理</h1>
          <p className="text-gray-500 mt-1">管理系统用户和角色</p>
        </div>
        {currentUserRole === 'ADMIN' && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog}>
                <Plus className="w-4 h-4 mr-2" />
                新增用户
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingUser ? '编辑用户' : '新增用户'}</DialogTitle>
                <DialogDescription>
                  {editingUser ? '修改用户信息' : '创建新的系统用户'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">用户名</Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      disabled={!!editingUser}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">
                      密码 {editingUser && <span className="text-xs text-gray-500">(不修改留空)</span>}
                    </Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="realName">真实姓名</Label>
                  <Input
                    id="realName"
                    value={formData.realName}
                    onChange={(e) => setFormData({ ...formData, realName: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">手机号</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">邮箱</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">角色</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(v) => setFormData({ ...formData, role: v as Role })}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">超级管理员</SelectItem>
                      <SelectItem value="MANAGER">管理员</SelectItem>
                      <SelectItem value="USER">录入员</SelectItem>
                      <SelectItem value="VIEWER">查看员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">用户列表</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户名</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>手机号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.realName}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'outline'}>
                      {roleLabels[user.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.phone || '-'}</TableCell>
                  <TableCell>
                    <Badge
                      variant={user.status === 'ACTIVE' ? 'success' : 'destructive'}
                      className="cursor-pointer"
                      onClick={() => currentUserRole === 'ADMIN' && toggleStatus(user)}
                    >
                      {user.status === 'ACTIVE' ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-500">{formatDate(user.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/permissions/${user.id}`)}
                      >
                        <Shield className="w-4 h-4" />
                      </Button>
                      {currentUserRole === 'ADMIN' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => handleDelete(user.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
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
