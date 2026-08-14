'use client'
/**
 * M2-T5 + M2-T6
 * 审批流程管理列表页
 * 路由：/approval/workflows
 *
 * 顶部：新建流程（选表）+ 表级触发绑定
 * 列表：流程卡片 → 跳转 /approval/workflows/[id]/designer
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Workflow, Search, ChevronRight, Settings, Trash2, Copy, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { TableBindingPanel, STATUS_META } from '@/components/approval/TableBindingPanel'
import type { WorkflowStatus, TriggerTable } from '@/components/approval/TableBindingPanel'

type Workflow = {
  id: number
  name: string
  description: string | null
  status: WorkflowStatus
  version: number
  isDefault: boolean
  tableId: number | null
  table?: { label: string; name: string }
  specialAction?: any
  createdAt: string
  updatedAt: string
  nodes: { id: number; nodeType: string; nodeName: string }[]
}
type Table = TriggerTable

export default function WorkflowsListPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [query, setQuery] = useState('')
  const [filterTableId, setFilterTableId] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [newForm, setNewForm] = useState<{ name: string; description: string }>({ name: '', description: '' })
  const [bindingTableId, setBindingTableId] = useState<number | null>(null)
  const [bindingOpen, setBindingOpen] = useState(false)

  async function refresh() {
    try {
      setLoading(true)
      const [w, t] = await Promise.all([
        fetch('/api/approval/workflows?pageSize=200').then(r => r.json()).then(r => r.workflows ?? []),
        fetch('/api/tables').then(r => r.json()).then(r => r.tables ?? []),
      ])
      setWorkflows(w); setTables(t)
    } finally { setLoading(false) }
  }
  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => workflows.filter(w => {
    if (filterTableId !== 'all' && String(w.tableId) !== filterTableId) return false
    if (filterStatus !== 'all' && w.status !== filterStatus) return false
    if (query) {
      const q = query.toLowerCase()
      return (w.name ?? '').toLowerCase().includes(q) || (w.description ?? '').toLowerCase().includes(q) || (w.table?.label ?? '').toLowerCase().includes(q)
    }
    return true
  }), [workflows, query, filterTableId, filterStatus])

  async function doCreate() {
    if (!newForm.name) return
    // 流程与表解耦：只填名称创建空壳流程（DRAFT），后续在“表级触发绑定”为各表触发事件选择本流程
    const r = await fetch('/api/approval/v2/workflows/blank', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newForm.name, description: newForm.description })
    })
    const res = await r.json()
    if (!res.ok) { alert(res.error ?? '创建失败'); return }
    setCreateOpen(false); setNewForm({ name: '', description: '' })
    await refresh()
    router.push(`/approval/workflows/${res.data.workflowId}/designer`)
  }

  async function doDelete(w: Workflow) {
    if (!confirm(`确认删除流程「${w.name}」？仅无实例的流程能删除。`)) return
    const r = await fetch(`/api/approval/workflows/${w.id}`, { method: 'DELETE' })
    const data = await r.json()
    if (r.status >= 400) return alert(data.message ?? '删除失败')
    refresh()
  }

  async function doCopy(w: Workflow) {
    const newName = prompt('复制流程：输入新流程名称', `${w.name}（副本）`) || ''
    if (!newName) return
    const r = await fetch(`/api/approval/v2/workflows/${w.id}/clone`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newName })
    })
    const res = await r.json()
    if (!res.ok) return alert(res.error ?? '复制失败')
    await refresh()
    router.push(`/approval/workflows/${res.data.workflowId}/designer`)
  }

  const ACTION_LABEL: Record<string, string> = {
    CREATE: '新增项目数据', UPDATE: '修改项目数据', DELETE: '删除项目数据', REVIEW: '审查项目数据',
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 grid place-items-center text-indigo-600"><Workflow className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">审批流程管理</h1>
            <p className="text-sm text-slate-500">专项动作审批设计（无需表级触发绑定）</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="w-4 h-4 mr-1" />新建流程</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>新建审批流程</DialogTitle>
                  <DialogDescription>创建后将跳转到可视化设计器。</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>流程名称</Label>
                    <Input placeholder="如：征收协议修改审批 v1" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>描述（可选）</Label>
                    <Input placeholder="简要说明流程用途" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
                  <Button onClick={doCreate} disabled={!newForm.name}>创建并进入设计器</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={bindingOpen} onOpenChange={setBindingOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" onClick={() => setBindingTableId(null)}>
                  <Settings className="w-4 h-4 mr-1" />表级触发绑定
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>M2-T6：表级审批触发绑定</DialogTitle>
                  <DialogDescription>为每张数据表配置不同触发事件对应哪个流程版本。</DialogDescription>
                </DialogHeader>
                <TableBindingPanel
                  tables={tables}
                  workflows={workflows}
                  initialTableId={bindingTableId}
                  onClose={() => { setBindingOpen(false); refresh() }}
                />
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setBindingOpen(false)}>关闭</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 筛选 */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-3 items-center">
            <div className="relative max-w-sm w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="搜索流程名/表名…" className="pl-9" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <Select value={filterTableId} onValueChange={setFilterTableId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="按表筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部数据表</SelectItem>
                {tables.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40"><SelectValue placeholder="按状态筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {(Object.keys(STATUS_META) as WorkflowStatus[]).map(s => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto text-xs text-slate-500">共 {filtered.length} 条流程</div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-5 h-5 mr-2 animate-spin" />加载中…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <div>暂无流程，点击右上角“新建流程”开始。</div>
              <div className="text-xs text-slate-400">或先去“表级触发绑定”配置每张表的触发事件对应哪个流程。</div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(w => {
              const meta = STATUS_META[w.status]
              return (
                <Card key={w.id} className="group hover:shadow-md transition-shadow overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-[15px] font-semibold truncate">{w.name}</CardTitle>
                          {w.isDefault && <Badge variant="outline" className="text-[10px] h-5 bg-indigo-50 text-indigo-600 border-indigo-200">默认</Badge>}
                          {w.specialAction && (
                            <Badge variant="outline" className="text-[10px] h-5 bg-emerald-50 text-emerald-600 border-emerald-200 shrink-0">
                              专项动作：{ACTION_LABEL[(w.specialAction as any)?.actionType] ?? '审批'}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1 line-clamp-2 text-xs">{w.description ?? '无描述'}</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 h-5 !text-[10px]', meta.cls)}>{meta.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2 text-xs space-y-1 text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">表：</span><span className="font-medium">{w.table?.label ?? (w.tableId != null ? `#${w.tableId}` : '未绑定表')}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">v{w.version}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">{w.nodes?.length ?? 0} 节点</span>
                    </div>
                    <div className="text-slate-400">最后更新：{new Date(w.updatedAt).toLocaleString()}</div>
                  </CardContent>
                  <CardFooter className="flex items-center justify-between pt-2">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => doDelete(w)} title="删除"><Trash2 className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => doCopy(w)} title="复制"><Copy className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => { setBindingTableId(w.tableId); setBindingOpen(true) }}>
                        <Settings className="w-3.5 h-3.5 mr-1" />绑定触发
                      </Button>
                      <Link href={`/approval/workflows/${w.id}/designer`}>
                        <Button size="sm">进入设计器<ChevronRight className="w-4 h-4 ml-1" /></Button>
                      </Link>
                    </div>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
