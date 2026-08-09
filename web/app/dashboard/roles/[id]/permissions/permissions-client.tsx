"use client"

import React, { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Save, Search, ShieldAlert, CheckCircle2 } from 'lucide-react'
import { PermissionTree } from '@/components/permission-tree'

interface RoleInfo { id: number; name: string; label: string; description: string | null; isSystem: boolean }
interface PTreeNode {
  id: string; type: any; label: string; moduleKey?: string; categoryId?: number; tableId?: number; opKey?: string;
  children?: PTreeNode[];
}

export function PermissionsClient({ role, tree, initialSelected }: {
  role: RoleInfo; tree: PTreeNode[]; initialSelected: string[];
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(initialSelected ?? [])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState('')

  const filteredTree = useMemo(() => filterTree(tree, filter.trim().toLowerCase()), [tree, filter])
  const selectedCount = selected.length
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

  async function handleSave() {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch(`/api/roles/${role.id}/permissions`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: selected })
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? data.message ?? '保存失败')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch (e: any) { alert(e.message ?? '保存失败') }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="w-4 h-4 mr-1" />返回角色列表</Button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">已勾选 {selectedLeavesCount}/{totalLeafCount} 叶子权限 · 共 {selectedCount} 项（含父级）</span>
          {saved && <Badge className="bg-emerald-600 text-white"><CheckCircle2 className="w-3 h-3 mr-1" />已保存</Badge>}
          <Button onClick={handleSave} disabled={saving || role.isSystem}>
            <Save className="w-4 h-4 mr-1" />{role.isSystem ? '系统角色' : '保存权限'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-indigo-600" />
                权限树配置 · {role.label} <span className="text-slate-500 font-normal text-sm">({role.name})</span>
              </CardTitle>
            </div>
            <CardDescription className="pt-1">
              按「模块 → 分类 → 数据表 → 操作」四级结构勾选；勾选父节点会自动勾选所有子节点，取消子节点会自动取消其无兄弟被选的父级。
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">角色信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">ID</span><span>{role.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">名称</span><span className="font-medium">{role.name}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">显示名</span><span>{role.label}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">类型</span><span>{role.isSystem ? <Badge variant="secondary">系统角色</Badge> : <Badge variant="outline">自定义</Badge>}</span></div>
            {role.description && <div><div className="text-slate-500 mb-1">描述</div><div>{role.description}</div></div>}
            <div className="pt-2 border-t">
              <div className="text-slate-500 mb-1">已勾选权限样例（前 8 个）</div>
              <ul className="text-xs text-slate-600 space-y-0.5">
                {selected.slice(0, 8).map(s => <li key={s} className="truncate">• {s}</li>)}
                {selected.length > 8 && <li className="text-slate-400">…另有 {selected.length - 8} 项</li>}
                {!selected.length && <li className="text-slate-400">（空）</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
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
