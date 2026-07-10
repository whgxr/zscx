"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Shield, ChevronRight, User, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function H5AdminPermissionsClient({ tables, users }: { tables: any[]; users: any[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = users.filter((u: any) =>
    !search || u.username.includes(search) || u.realName?.includes(search)
  )

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">权限管理</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="搜索用户"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 pl-9 text-sm rounded-xl"
        />
      </div>

      <div className="text-sm text-gray-500 mb-4">
        {tables.length} 个数据表 · {filtered.length} 个用户 · 点击用户配置权限
      </div>

      <div className="space-y-2">
        {filtered.map((u: any) => (
          <div
            key={u.id}
            className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between"
            onClick={() => router.push(`/h5/admin/permissions/${u.id}`)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
                <span className="text-purple-600 font-bold text-sm">{(u.realName || u.username).charAt(0)}</span>
              </div>
              <div>
                <p className="text-sm font-medium">{u.realName || u.username}</p>
                <p className="text-xs text-gray-400">@{u.username}</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        ))}
      </div>
    </div>
  )
}