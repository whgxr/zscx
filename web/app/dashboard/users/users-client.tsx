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
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs"
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
  Search,
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
  const [activeTab, setActiveTab] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    realName: '',
    phone: '',
    email: '',
    role: 'USER' as Role,
  })

  const roleTabConfigs = [
    { value: 'all', label: '全部', role: null as Role | null },
    { value: 'ADMIN', label: '超级管理员', role: Role.ADMIN },
    { value: 'MANAGER', label: '管理员', role: Role.MANAGER },
    { value: 'USER', label: '录入员', role: Role.USER },
    { value: 'VIEWER', label: '查看员', role: Role.VIEWER },
  ]

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchRole = activeTab === 'all' || user.role === activeTab
      const matchSearch = !searchTerm || 
        user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.realName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (user.phone && user.phone.includes(searchTerm))
      return matchRole && matchSearch
    })
  }, [users, activeTab, searchTerm])

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length }
    users.forEach(u => {
      counts[u.role] = (counts[u.role] || 0) + 1
    })
    return counts
  }, [users])

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
          <>
            <Button onClick={openCreateDialog}>
              <Plus className="w-4 h-4 mr-2" />
              新增用户
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
          </>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="text-lg">用户列表</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="搜索用户名/姓名/手机号"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid grid-cols-5 w-full">
              {roleTabConfigs.map(tab => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  <Badge variant="secondary" className="ml-1.5 text-xs">
                    {roleCounts[tab.value] || 0}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
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
                          title="权限管理"
                          onClick={() => router.push(`/dashboard/permissions/${user.id}`)}
                        >
                          <Shield className="w-4 h-4" />
                        </Button>
                        {currentUserRole === 'ADMIN' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              title="编辑用户"
                              onClick={() => openEditDialog(user)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-600"
                              title="删除用户"
                              onClick={() => handleDelete(user.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>暂无用户</p>
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
