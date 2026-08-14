'use client'
/**
 * 表级审批触发绑定面板（M2-T6）
 * 为每张数据表配置不同触发事件（手动提交/征收保存/同步通过/批量导入）对应哪个流程版本。
 * 被审批流程管理页与系统审批页共用。
 */
import React, { useEffect, useState } from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'

export type TriggerEvent = 'MANUAL_SUBMIT' | 'LEVY_SAVE' | 'LEVY_SYNC_PASS' | 'DATA_BATCH_IMPORT'
export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export type TriggerTable = {
  id: number
  name: string
  label: string
  categoryId?: number | null
  approvalTriggerConfig?: any
  featureFlags?: any
}

export type TriggerWorkflow = {
  id: number
  name: string
  description: string | null
  status: WorkflowStatus
  version: number
  tableId: number | null
  table?: { label: string; name: string }
}

export const STATUS_META: Record<WorkflowStatus, { label: string; cls: string }> = {
  DRAFT:      { label: '草稿',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PUBLISHED:  { label: '已发布',cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  ACTIVE:     { label: '激活中',cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE:   { label: '已停用',cls: 'bg-slate-50 text-slate-500 border-slate-200' },
  ARCHIVED:   { label: '已归档',cls: 'bg-zinc-50 text-zinc-500 border-zinc-200' },
}

export const TRIGGER_META: Record<TriggerEvent, { label: string; desc: string }> = {
  MANUAL_SUBMIT:    { label: '手动提交审批', desc: '用户在调查表/征收表详情点“提交审批”按钮触发' },
  LEVY_SAVE:        { label: '征收表保存后自动审批', desc: '征收记录 POST/PUT 后自动发起审批（M2-T4）' },
  LEVY_SYNC_PASS:   { label: '调查→征收同步通过后审批', desc: '调查侧更新同步到征收，同步请求通过后发起审批' },
  DATA_BATCH_IMPORT:{ label: '批量导入后自动审批', desc: '批量导入完成后自动审批（预留）' },
}

type BindingCfg = Record<TriggerEvent, { enabled: boolean; workflowId: number | null; workflowVersion?: number | null }>

export function TableBindingPanel({ tables, workflows, initialTableId, onClose }: {
  tables: TriggerTable[]; workflows: TriggerWorkflow[];
  initialTableId: number | null; onClose: () => void
}) {
  const [tableId, setTableId] = useState<number | null>(initialTableId ?? (tables[0]?.id ?? null))
  const table = tables.find(t => t.id === tableId) ?? null
  const [cfg, setCfg] = useState<BindingCfg>(
    { MANUAL_SUBMIT: { enabled: false, workflowId: null }, LEVY_SAVE: { enabled: false, workflowId: null }, LEVY_SYNC_PASS: { enabled: false, workflowId: null }, DATA_BATCH_IMPORT: { enabled: false, workflowId: null } }
  )
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [useV2Flag, setUseV2Flag] = useState(false)
  const [useLevyFlag, setUseLevyFlag] = useState(false)

  useEffect(() => {
    if (!table) return
    let c: BindingCfg = { MANUAL_SUBMIT: { enabled: false, workflowId: null }, LEVY_SAVE: { enabled: false, workflowId: null }, LEVY_SYNC_PASS: { enabled: false, workflowId: null }, DATA_BATCH_IMPORT: { enabled: false, workflowId: null } }
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

  // 流程与表解耦：触发绑定时可选任意流程（不再按表过滤）
  const allWorkflows = workflows.filter(w => w.status === 'ACTIVE' || w.status === 'PUBLISHED' || w.status === 'DRAFT')

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
                        {allWorkflows.length > 0 ? (
                          <>
                            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-slate-400">可用流程</div>
                            {allWorkflows.map(w => (
                              <SelectItem key={w.id} value={String(w.id)}>
                                {w.name} <span className="text-slate-400 ml-2">v{w.version} · {STATUS_META[w.status].label}</span>
                              </SelectItem>
                            ))}
                          </>
                        ) : (
                          <div className="px-2 py-2 text-[11px] text-slate-400">暂无可用流程，请先在「审批流程」中创建并发布流程。</div>
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
