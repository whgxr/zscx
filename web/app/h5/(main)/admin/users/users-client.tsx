"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, ChevronRight, Search, Plus, Loader2, X, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const roleLabels: Record<string, string> = {
  ADMIN: '超级管理员',
  MANAGER: '管理员',
  USER: '录入员',
  VIEWER: '查看员',
}

export function H5AdminUsersClient({ users, roles }: { users: any[]; roles: any[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [newUser, setNewUser] = useState({ username: '', password: '', realName: '', phone: '', roleId: '' })
  const [loading, setLoading] = useState(false)

  const filtered = users.filter((u: any) =>
    !search || u.username.includes(search) || u.realName?.includes(search) || u.phone?.includes(search)
  )

  const handleCreateUser = async () => {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      alert('请填写用户名和密码')
      return
    }
    if (newUser.password.length < 6) {
      alert('密码至少6位')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUser.username.trim(),
          password: newUser.password,
          realName: newUser.realName.trim(),
          phone: newUser.phone.trim(),
          roleId: newUser.roleId ? parseInt(newUser.roleId) : undefined,
        }),
      })
      if (res.ok) {
        alert('创建成功')
        setShowCreate(false)
        setNewUser({ username: '', password: '', realName: '', phone: '', roleId: '' })
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '创建失败')
      }
    } catch {
      alert('创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">用户管理</h1>
        </div>
        <Button size="sm" className="h-8 rounded-lg" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />新增
        </Button>
      </div>

      {/* 新增用户弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg bg-white rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">新增用户</h3>
              <button onClick={() => setShowCreate(false)} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">用户名<span className="text-red-500">*</span></Label>
                <Input placeholder="登录用户名" value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div className="relative">
                <Label className="text-sm">密码<span className="text-red-500">*</span></Label>
                <div className="relative mt-1">
                  <Input type={showPassword ? 'text' : 'password'} placeholder="至少6位" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} className="h-10 text-sm rounded-lg pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
                    {showPassword ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-sm">姓名</Label>
                <Input placeholder="真实姓名" value={newUser.realName} onChange={(e) => setNewUser({ ...newUser, realName: e.target.value })} className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-sm">手机号</Label>
                <Input placeholder="手机号" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-sm">角色</Label>
                <select value={newUser.roleId} onChange={(e) => setNewUser({ ...newUser, roleId: e.target.value })} className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white mt-1">
                  <option value="">请选择角色</option>
                  {roles.map((r: any) => (
                    <option key={r.id} value={r.id}>{roleLabels[r.name] || r.name}</option>
                  ))}
                </select>
              </div>
              <Button onClick={handleCreateUser} disabled={loading} className="w-full h-11 rounded-xl">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />创建中...</> : '确认创建'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="搜索用户名、姓名、手机号" value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 pl-9 text-sm rounded-xl" />
      </div>

      <div className="text-sm text-gray-500 mb-4">共 {filtered.length} 个用户</div>

      <div className="space-y-2">
        {filtered.map((u: any) => (
          <div key={u.id} className="bg-white rounded-xl p-4 shadow-sm" onClick={() => router.push(`/h5/admin/users/${u.id}`)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="text-primary font-bold text-sm">{(u.realName || u.username).charAt(0)}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{u.realName || u.username}</p>
                  <p className="text-xs text-gray-400">@{u.username}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.status === 'ACTIVE' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                  {u.status === 'ACTIVE' ? '正常' : '禁用'}
                </span>
                <span className="text-xs text-gray-400">{roleLabels[u.role?.name] || u.role?.name}</span>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}