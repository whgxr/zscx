"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, User, ChevronRight, Shield, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const roleLabels: Record<string, string> = {
  ADMIN: '超级管理员',
  MANAGER: '管理员',
  USER: '录入员',
  VIEWER: '查看员',
}

export function H5AdminUsersClient({ users, roles }: { users: any[]; roles: any[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = users.filter((u: any) =>
    !search || u.username.includes(search) || u.realName?.includes(search) || u.phone?.includes(search)
  )

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">用户管理</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="搜索用户名、姓名、手机号"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 pl-9 text-sm rounded-xl"
        />
      </div>

      <div className="text-sm text-gray-500 mb-4">共 {filtered.length} 个用户</div>

      <div className="space-y-2">
        {filtered.map((u: any) => (
          <div
            key={u.id}
            className="bg-white rounded-xl p-4 shadow-sm"
            onClick={() => router.push(`/h5/admin/users/${u.id}`)}
          >
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
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  u.status === 'ACTIVE' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'
                }`}>
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