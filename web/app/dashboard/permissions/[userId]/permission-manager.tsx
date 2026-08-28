"use client"

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Shield, ShieldAlert, Search, CheckCircle2 } from 'lucide-react'
import { PermissionTree } from '@/components/permission-tree'

interface PTreeNode {
  id: string
  type: any
  label: string
  moduleKey?: string
  categoryId?: number
  tableId?: number
  opKey?: string
  children?: PTreeNode[]
}

interface PermissionManagerProps {
  targetUser: {
    id: number
    username: string
    realName: string
    role: string
  }
  tree: PTreeNode[]
  initialSelected: string[]
}

export function PermissionManager({ targetUser, tree, initialSelected }: PermissionManagerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(initialSelected ?? [])
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState('')

  const isAdmin = targetUser.role === 'ADMIN' || targetUser.role === 'MANAGER'

  const filteredTree = useMemo(() => filterTree(tree, filter.trim().toLowerCase()), [tree, filter])
  const totalLeafCount = useMemo(() => countLeaves(tree), [tree])
  const selectedLeavesCount = useMemo(() => {
    const allLeaves = new Set<string>()
    const walk = (n: PTreeNode) => {
      const kids = n.children ?? []
      if (!kids.length) allLeaves.add(n.id)
      else kids.forEach(walk)
    }
    tree.forEach(walk)
    return selected.filter(s => allLeaves.has(s)).length
  }, [selected, tree])

  const handleSave = async () => {
    setLoading(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/permissions/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: selected }),
      })

      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">权限管理</h1>
            <p className="text-gray-500 mt-1">
              为用户 {targetUser.realName} ({targetUser.username}) 设置数据表权限
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">
            已勾选 {selectedLeavesCount}/{totalLeafCount} 叶子权限 · 共 {selected.length} 项（含父级）
          </span>
          {saved && <Badge className="bg-emerald-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />已保存</Badge>}
          <Button onClick={handleSave} disabled={loading || isAdmin}>
            <Save className="w-4 h-4 mr-2" />
            {loading ? '保存中...' : '保存权限'}
          </Button>
        </div>
      </div>

      {isAdmin && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-medium text-blue-800">管理员角色拥有全部权限</p>
                <p className="text-sm text-blue-600">该用户是管理员角色，默认拥有所有数据表的全部权限</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-600" />
              权限树配置
            </CardTitle>
          </div>
          <CardDescription className="pt-1">
            按「模块 → 分类 → 数据表 → 操作」结构勾选；勾选父节点会自动勾选所有子节点，取消子节点会自动取消其无兄弟被选的父级。
          </CardDescription>
          <div className="pt-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400" />
            <Input placeholder="搜索节点（模块/分类/表/操作）…" value={filter} onChange={e => setFilter(e.target.value)} className="max-w-md h-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-3 max-h-[70vh] overflow-auto bg-slate-50/50">
            {filteredTree.length ? (
              <PermissionTree tree={filteredTree as any} value={selected} onChange={setSelected} />
            ) : (
              <div className="text-sm text-slate-500 text-center py-16">未匹配到节点</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function countLeaves(tree: PTreeNode[]): number {
  let n = 0
  const walk = (x: PTreeNode) => {
    const kids = x.children ?? []
    if (!kids.length) n++
    else kids.forEach(walk)
  }
  tree.forEach(walk)
  return n
}

function filterTree(tree: PTreeNode[], kw: string): PTreeNode[] {
  if (!kw) return tree
  const keep = (n: PTreeNode): PTreeNode | null => {
    const kids = (n.children ?? []).map(keep).filter(Boolean) as PTreeNode[]
    const labelMatch = n.label.toLowerCase().includes(kw)
    const idMatch = n.id.toLowerCase().includes(kw)
    if (labelMatch || idMatch || kids.length) return { ...n, children: kids.length ? kids : undefined }
    return null
  }
  return tree.map(keep).filter(Boolean) as PTreeNode[]
}
