'use client'
/**
 * M2-T5 + M2-T6
 * 审批流程管理列表页
 * 路由：/approval/workflows
 *
 * 顶部：新建流程（选表）
 * 列表：流程卡片 → 跳转 /approval/workflows/[id]/designer
 *       M2-T6：每张表右侧可“配置该表的触发绑定”抽屉
 */
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Workflow, Search, ChevronRight, Settings, Trash2, Copy, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
type Workflow = {
  id: number
  name: string
  description: string | null
  status: WorkflowStatus
  version: number
  isDefault: boolean
  tableId: number
  table?: { label: string; name: string }
  createdAt: string
  updatedAt: string
  nodes: { id: number; nodeType: string; nodeName: string }[]
}
type Table = { id: number; name: string; label: string; categoryId?: number | null; approvalTriggerConfig?: any; featureFlags?: any }
type TriggerEvent = 'MANUAL_SUBMIT' | 'LEVY_SAVE' | 'LEVY_SYNC_PASS' | 'DATA_BATCH_IMPORT'

const STATUS_META: Record<WorkflowStatus, { label: string; cls: string }> = {
  DRAFT:      { label: '草稿',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PUBLISHED:  { label: '已发布',cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ACTIVE:     { label: '激活中',cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE:   { label: '已停用',cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  ARCHIVED:   { label: '已归档',cls: 'bg-zinc-50 text-zinc-500 border-zinc-200' },
}
const TRIGGER_META: Record<TriggerEvent, { label: string; desc: string }> = {
  MANUAL_SUBMIT:    { label: '手动提交审批', desc: '用户在调查表/征收表详情点“提交审批”按钮触发' },
  LEVY_SAVE:        { label: '征收表保存后自动审批', desc: '征收记录 POST/PUT 后自动发起审批（M2-T4）' },
  LEVY_SYNC_PASS:   { label: '调查→征收同步通过后审批', desc: '调查侧更新同步到征收，同步请求通过后发起审批' },
  DATA_BATCH_IMPORT:{ label: '批量导入后自动审批', desc: '批量导入完成后自动审批（预留）' },
}

export default function WorkflowsListPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [tables, setTables] = useState<Table[]>([])
  const [query, setQuery] = useState('')
  const [filterTableId, setFilterTableId] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const [createOpen, setCreateOpen] = useState(false)
  const [newForm, setNewForm] = useState<{ name: string; tableId: number | null; description: string }>({ name: '', tableId: null, description: '' })
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
    if (!newForm.name || !newForm.tableId) return
    // 对于 v2，我们只创建一个空壳流程（状态为 DRAFT），不使用 v1 create API 要求的 nodes
    const r = await fetch('/api/approval/v2/workflows/blank', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: newForm.name, tableId: newForm.tableId, description: newForm.description })
    })
    const res = await r.json()
    if (!res.ok) { alert(res.error ?? '创建失败'); return }
    setCreateOpen(false); setNewForm({ name: '', tableId: null, description: '' })
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* 顶栏 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 grid place-items-center text-indigo-600"><Workflow className="w-5 h-5" /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">审批流程管理</h1>
            <p className="text-sm text-slate-500">v1.2.2 可视化流程设计器（M2）</p>
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
                    <Label>绑定数据表</Label>
                    <Select value={String(newForm.tableId ?? '')} onValueChange={v => setNewForm(f => ({ ...f, tableId: Number(v) }))}>
                      <SelectTrigger><SelectValue placeholder="选择数据表" /></SelectTrigger>
                      <SelectContent>
                        {tables.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.label} <span className="text-slate-400">（{t.name}）</span></SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>描述（可选）</Label>
                    <Input placeholder="简要说明流程用途" value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
                  <Button onClick={doCreate} disabled={!newForm.name || !newForm.tableId}>创建并进入设计器</Button>
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
                        </div>
                        <CardDescription className="mt-1 line-clamp-2 text-xs">{w.description ?? '无描述'}</CardDescription>
                      </div>
                      <Badge variant="outline" className={cn('shrink-0 h-5 !text-[10px]', meta.cls)}>{meta.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2 text-xs space-y-1 text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">表：</span><span className="font-medium">{w.table?.label ?? `#${w.tableId}`}</span>
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

// ==================== M2-T6：表级触发绑定抽屉内容 ====================
function TableBindingPanel({ tables, workflows, initialTableId, onClose }: {
  tables: Table[]; workflows: Workflow[];
  initialTableId: number | null; onClose: () => void
}) {
  const [tableId, setTableId] = useState<number | null>(initialTableId ?? (tables[0]?.id ?? null))
  const table = tables.find(t => t.id === tableId) ?? null
  const [cfg, setCfg] = useState<Record<TriggerEvent, { enabled: boolean; workflowId: number | null; workflowVersion?: number | null }>>(
    { MANUAL_SUBMIT: { enabled: false, workflowId: null }, LEVY_SAVE: { enabled: false, workflowId: null }, LEVY_SYNC_PASS: { enabled: false, workflowId: null }, DATA_BATCH_IMPORT: { enabled: false, workflowId: null } }
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [useV2Flag, setUseV2Flag] = useState(false)
  const [useLevyFlag, setUseLevyFlag] = useState(false)

  useEffect(() => {
    if (!table) return
    let c: any = { MANUAL_SUBMIT: { enabled: false, workflowId: null }, LEVY_SAVE: { enabled: false, workflowId: null }, LEVY_SYNC_PASS: { enabled: false, workflowId: null }, DATA_BATCH_IMPORT: { enabled: false, workflowId: null } }
    try {
      if (table.approvalTriggerConfig && typeof table.approvalTriggerConfig === 'object') c = { ...c, ...table.approvalTriggerConfig }
      else if (typeof table.approvalTriggerConfig === 'string') c = { ...c, ...JSON.parse(table.approvalTriggerConfig) }
    } catch {}
    setCfg(c)
    let flags: any = {}
    try {
      if (table.featureFlags && typeof table.featureFlags === 'object') flags = table.featureFlags
      else if (typeof table.featureFlags === 'string') flags = JSON.parse(table.featureFlags)
    } catch {}
    setUseV2Flag(flags.enableApprovalV2 ?? false)
    setUseLevyFlag(flags.enableLevyFeatures ?? false)
  }, [tableId, table])

  async function doSave() {
    try {
      setSaving(true)
      const r = await fetch(`/api/approval/v2/table-binding`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tableId,
          approvalTriggerConfig: cfg,
          featureFlags: { enableApprovalV2: useV2Flag, enableLevyFeatures: useLevyFlag }
        })
      })
      const res = await r.json()
      if (!res.ok) throw new Error(res.error ?? '保存失败')
      setToast('ok'); setTimeout(() => setToast(null), 1500)
      onClose()
    } catch (e: any) {
      setToast(e.message ?? '保存失败'); setTimeout(() => setToast(null), 2500)
    } finally { setSaving(false) }
  }

  if (tables.length === 0) return <div className="px-6 py-10 text-slate-500 text-sm">还没有数据表，请先创建表。</div>

  const availableWorkflows = workflows.filter(w => w.tableId === tableId && (w.status === 'ACTIVE' || w.status === 'PUBLISHED' || w.status === 'DRAFT'))
  const otherWorkflows = workflows.filter(w => w.tableId !== tableId && (w.status === 'ACTIVE' || w.status === 'PUBLISHED'))

  return (
    <div className="px-6 pb-6">
      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-3">
          <div className="space-y-1">
            <Label>选择数据表</Label>
            <Select value={String(tableId ?? '')} onValueChange={v => setTableId(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tables.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">启用新审批引擎 (v2)</div>
                  <div className="text-[11px] text-slate-500">开启后该表的发起/审批走本页绑定流程</div>
                </div>
                <Switch checked={useV2Flag} onCheckedChange={setUseV2Flag} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-800">征收模块功能</div>
                  <div className="text-[11px] text-slate-500">仅对 LEVY 模块表开启 LEVY_SAVE 等触发</div>
                </div>
                <Switch checked={useLevyFlag} onCheckedChange={setUseLevyFlag} />
              </div>
            </CardContent>
          </Card>
          <CardDescription className="text-[11px]">
            流程绑定规则：每张表 × 每种触发事件只能绑定 <b>一条</b> 流程（可按版本号锁钉）。
          </CardDescription>
        </div>
        <div className="md:col-span-2 space-y-3">
          <Tabs defaultValue="MANUAL_SUBMIT">
            <TabsList className="grid grid-cols-4 w-full">
              {(Object.keys(TRIGGER_META) as TriggerEvent[]).map(ev => (
                <TabsTrigger key={ev} value={ev} className="data-[state=active]:bg-indigo-50 relative">
                  {TRIGGER_META[ev].label}
                  {cfg[ev]?.enabled && <CheckCircle2 className="w-3 h-3 text-emerald-500 absolute -top-0.5 -right-0.5" />}
                </TabsTrigger>
              ))}
            </TabsList>
            {(Object.keys(TRIGGER_META) as TriggerEvent[]).map(ev => {
              const cur = cfg[ev]
              return (
                <TabsContent key={ev} value={ev} className="pt-3 space-y-3">
                  <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">{TRIGGER_META[ev].desc}</div>
                  <div className="flex items-center justify-between">
                    <Label>启用该触发</Label>
                    <Switch checked={!!cur.enabled}
                      onCheckedChange={c => setCfg(x => ({ ...x, [ev]: { ...cur, enabled: c } }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>绑定流程</Label>
                    <Select
                      disabled={!cur.enabled}
                      value={String(cur.workflowId ?? '')}
                      onValueChange={v => setCfg(x => ({ ...x, [ev]: { ...cur, workflowId: Number(v) } }))}
                    >
                      <SelectTrigger><SelectValue placeholder={cur.enabled ? '选择流程' : '请先启用触发'} /></SelectTrigger>
                      <SelectContent>
                        {availableWorkflows.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400">同表流程</div>
                            {availableWorkflows.map(w => (
                              <SelectItem key={w.id} value={String(w.id)}>
                                {w.name} <span className="text-slate-400 ml-2">v{w.version} · {STATUS_META[w.status].label}</span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                        {otherWorkflows.length > 0 && (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400">其他表流程（可选作模板）</div>
                            {otherWorkflows.map(w => (
                              <SelectItem key={w.id} value={String(w.id)}>
                                {w.name} <span className="text-slate-400 ml-2">v{w.version} · {w.table?.label ?? `#${w.tableId}`}</span>
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>锁定版本号（留空跟随最新）</Label>
                    <Input
                      type="number"
                      disabled={!cur.enabled || !cur.workflowId}
                      value={cur.workflowVersion ?? ''}
                      placeholder="例：3"
                      onChange={e => setCfg(x => ({ ...x, [ev]: { ...cur, workflowVersion: e.target.value ? Number(e.target.value) : null } }))}
                    />
                  </div>
                </TabsContent>
              )
            })}
          </Tabs>
        </div>
      </div>
      <div className="mt-6 flex items-center justify-end gap-2">
        {toast === 'ok' && <Badge className="bg-emerald-50 border-emerald-200 text-emerald-700">保存成功</Badge>}
        {typeof toast === 'string' && toast !== 'ok' && <Badge className="bg-rose-50 border-rose-200 text-rose-700">{toast}</Badge>}
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button onClick={doSave} disabled={saving || !tableId}>
          {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
          保存配置
        </Button>
      </div>
    </div>
  )
}
