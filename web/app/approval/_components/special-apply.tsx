'use client'
/**
 * 审批中心 - 专项动作申请发起
 *
 * 展示当前用户有权限发起的专项动作审批流程（按角色可见）。
 * 点击流程 → 选择目标记录（修改/删除/审查）或填写新数据（新增）→ 发起审批。
 */
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, PlusCircle, RefreshCw, FileEdit, Trash2, FileCheck2, FilePlus2, AlertCircle } from 'lucide-react'

type SpecialWorkflow = {
  id: number
  name: string
  description: string | null
  version: number
  specialAction: {
    actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'REVIEW'
    targetTableId: number | null
    targetTableLabel?: string
    editableFields: { name: string; label: string }[]
    dataScope: { field: string; op: string; value: string }[]
    visibleRoleIds: number[]
  } | null
  targetTable: { id: number; label: string } | null
}

type RecordRow = { id: number; data: any; updatedAt: string }

const ACTION_META: Record<string, { label: string; icon: any; cls: string }> = {
  CREATE: { label: '新增记录', icon: FilePlus2, cls: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  UPDATE: { label: '修改记录', icon: FileEdit, cls: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
  DELETE: { label: '删除记录', icon: Trash2, cls: 'bg-rose-50 text-rose-600 border-rose-200' },
  REVIEW: { label: '审查复核', icon: FileCheck2, cls: 'bg-amber-50 text-amber-600 border-amber-200' },
}

export function SpecialApplyPage() {
  const [flows, setFlows] = useState<SpecialWorkflow[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState<SpecialWorkflow | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null)
  // 新增表单数据
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/approval/special-actions')
      const j = await r.json()
      if (j.ok) setFlows(j.data ?? [])
      else alert(j.error)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function openFlow(f: SpecialWorkflow) {
    setActive(f)
    setSelectedRecordId(null)
    setComment('')
    setFormData({})
    if (f.specialAction?.actionType !== 'CREATE' && f.specialAction?.targetTableId) {
      await loadRecords(f.specialAction.targetTableId, f.specialAction.dataScope)
    }
  }

  async function loadRecords(tableId: number, dataScope?: any[]) {
    setRecordsLoading(true)
    try {
      const q = new URLSearchParams({ tableId: String(tableId), pageSize: '200' })
      if (dataScope?.length) q.set('scope', JSON.stringify(dataScope))
      const r = await fetch(`/api/approval/special-actions/records?${q}`)
      const j = await r.json()
      if (j.ok) setRecords(j.data ?? [])
      else setRecords([])
    } finally { setRecordsLoading(false) }
  }

  const editableFieldDefs = active?.specialAction?.editableFields ?? []

  async function submit() {
    if (!active) return
    const sa = active.specialAction
    if (!sa) return
    if (sa.actionType !== 'CREATE' && !selectedRecordId) {
      alert('请先选择目标记录'); return
    }
    setSubmitting(true)
    try {
      const payload: any = {
        workflowId: active.id,
        actionType: sa.actionType,
        recordId: selectedRecordId ?? undefined,
      }
      if (sa.actionType === 'CREATE') {
        payload.formData = formData
      } else if (sa.actionType === 'UPDATE') {
        payload.formData = formData
      }
      if (comment) payload.comment = comment
      const r = await fetch('/api/approval/special-actions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error ?? j.message ?? '发起失败')
      alert('已发起审批，可在「我的发起」中查看进度。')
      setActive(null)
      load()
    } catch (e: any) {
      alert(e.message)
    } finally { setSubmitting(false) }
  }

  const previewLabel = (rec: RecordRow, fields?: any[]) => {
    const flds = fields?.slice(0, 3) ?? []
    const parts = flds.map(f => rec.data?.[f.name] ?? '').filter(Boolean)
    return parts.length ? parts.join(' · ') : `记录 #${rec.id}`
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">发起申请</h1>
          <p className="text-sm text-slate-500 mt-1">
            选择一项你有权限发起的专项动作审批，填写内容后提交进入审批流程。
          </p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="w-5 h-5 mr-2 animate-spin" />加载中…</div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="p-16 text-center text-slate-500 flex flex-col items-center gap-3">
            <AlertCircle className="w-10 h-10 text-slate-300" />
            <div>当前没有你可发起的专项动作审批。</div>
            <div className="text-xs text-slate-400">请管理员在「审批流程」中设计并发布专项动作审批流程，并勾选你的角色。</div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {flows.map(f => {
            const meta = ACTION_META[f.specialAction?.actionType ?? 'CREATE']
            const Icon = meta.icon
            return (
              <Card key={f.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-2">
                    <div className={`w-9 h-9 rounded-lg grid place-items-center border shrink-0 ${meta.cls}`}><Icon className="w-5 h-5" /></div>
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-[15px] font-semibold truncate">{f.name}</CardTitle>
                      <CardDescription className="mt-0.5 line-clamp-2 text-xs">{f.specialAction?.actionType === 'CREATE' ? '可在所选项目新增一条数据记录' : f.description ?? '专项动作审批申请'}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pb-2 text-xs space-y-1 text-slate-600">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={meta.cls}>{meta.label}</Badge>
                    <span className="text-slate-400">目标：</span>
                    <span className="font-medium">{f.targetTable?.label ?? '未配置'}</span>
                  </div>
                  {f.specialAction?.actionType === 'UPDATE' && (
                    <div className="text-slate-500">可编辑字段：{f.specialAction.editableFields.map(x => x.label).join('、') || '无'}</div>
                  )}
                  {f.specialAction?.dataScope?.length > 0 && (
                    <div className="text-slate-500">范围：{f.specialAction.dataScope.map(d => `${d.field} ${d.op} ${d.value}`).join('；')}</div>
                  )}
                </CardContent>
                <CardFooter className="pt-2">
                  <Button size="sm" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => openFlow(f)}>
                    <PlusCircle className="w-4 h-4 mr-1" />发起申请
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* 发起弹窗 */}
      <Dialog open={!!active} onOpenChange={v => { if (!v) setActive(null) }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.name}</DialogTitle>
            <DialogDescription>
              {active && ACTION_META[active.specialAction?.actionType ?? 'CREATE']?.label}·
              {active?.targetTable?.label}
            </DialogDescription>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              {/* 非新增：选择目标记录 */}
              {active.specialAction?.actionType !== 'CREATE' && (
                <div className="space-y-2">
                  <Label>选择目标记录</Label>
                  {recordsLoading ? (
                    <div className="text-sm text-slate-400 flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />加载记录…</div>
                  ) : records.length === 0 ? (
                    <div className="text-sm text-slate-400 italic">该项目暂无记录</div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                      {records.map(rec => (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => setSelectedRecordId(rec.id)}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 transition-colors ${
                            selectedRecordId === rec.id ? 'bg-indigo-50' : ''
                          }`}
                        >
                          <span className="truncate">{previewLabel(rec, active.specialAction?.editableFields)}</span>
                          <span className="text-xs text-slate-400 font-mono ml-2 shrink-0">#{rec.id}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 新增/修改：可编辑字段表单 */}
              {(active.specialAction?.actionType === 'CREATE' || active.specialAction?.actionType === 'UPDATE') && (
                <div className="space-y-2">
                  <Label>
                    {active.specialAction?.actionType === 'CREATE'
                      ? '新增数据内容'
                      : '修改字段内容（仅以下字段可编辑）'}
                  </Label>
                  {editableFieldDefs.length === 0 ? (
                    <div className="text-xs text-amber-600">该流程未配置可编辑字段，无法填写内容</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {editableFieldDefs.map(f => (
                        <div key={f.name} className="space-y-1">
                          <Label className="text-xs text-slate-500">{f.label}</Label>
                          <Input
                            value={formData[f.name] ?? ''}
                            onChange={e => setFormData(d => ({ ...d, [f.name]: e.target.value }))}
                            placeholder={f.label}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-500">申请说明（可选）</Label>
                <Textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} placeholder="补充说明本次申请的目的" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActive(null)}>取消</Button>
            <Button onClick={submit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              提交审批
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}