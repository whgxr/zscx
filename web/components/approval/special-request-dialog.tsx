'use client'
/**
 * 专项审批发起弹窗
 *
 * 在数据页/详情页点「发起审批」时弹出，列出当前表（可选）当前用户有权限发起的专项动作流程，
 * 选中流程后：非新增需先选择目标记录；新增/修改需填写可编辑字段；最终提交进入审批。
 *
 * 由 H5 数据列表、H5 记录详情等入口复用。
 */
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, PlusCircle, RefreshCw, FileEdit, Trash2, FileCheck2, FilePlus2, AlertCircle, X } from 'lucide-react'

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

interface SpecialRequestDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  tableId: number
  tableLabel?: string
  /** 详情页可预选当前记录（传入后锁定该记录，不再让用户选择） */
  defaultRecordId?: number | null
  /** 当前记录数据，用于 UPDATE 类流程预填可编辑字段 */
  defaultRecordData?: Record<string, any> | null
  /** 发起成功后回调（如刷新列表） */
  onDone?: () => void
}

export function SpecialRequestDialog({
  open, onOpenChange, tableId, tableLabel, defaultRecordId, defaultRecordData, onDone,
}: SpecialRequestDialogProps) {
  const [flows, setFlows] = useState<SpecialWorkflow[]>([])
  const [flowLoading, setFlowLoading] = useState(false)
  const [active, setActive] = useState<SpecialWorkflow | null>(null)
  const [records, setRecords] = useState<RecordRow[]>([])
  const [recLoading, setRecLoading] = useState(false)
  const [recId, setRecId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setActive(null); setRecords([]); setRecId(null); setForm({}); setComment(''); setError('')
  }

  async function loadFlows() {
    if (!open) return
    setFlowLoading(true); setError('')
    try {
      const r = await fetch(`/api/approval/special-actions?tableId=${tableId}`)
      const j = await r.json()
      if (j.ok) setFlows(j.data ?? [])
      else setError(j.error || '加载专项流程失败')
    } catch { setError('加载专项流程失败') }
    finally { setFlowLoading(false) }
  }

  useEffect(() => { if (open) { reset(); loadFlows() } }, [open, tableId])

  // 从目标记录（详情页）发起：锁定该记录，选中流程后无需再选择目标记录
  const lockedRecord = Boolean(defaultRecordId)

  async function pick(f: SpecialWorkflow) {
    setActive(f); setError('')
    const actionType = f.specialAction?.actionType
    const editable = f.specialAction?.editableFields ?? []

    // 详情页发起：直接锁定当前记录
    if (lockedRecord) {
      setRecId(defaultRecordId!)
      setForm({})
      if (actionType === 'UPDATE') {
        const fd: Record<string, string> = {}
        for (const ef of editable) fd[ef.name] = defaultRecordData?.[ef.name] != null ? String(defaultRecordData[ef.name]) : ''
        setForm(fd)
      }
      return
    }

    // 列表页发起：需选择目标记录
    setRecId(null); setForm({})
    const targetTableId = f.specialAction?.targetTableId ?? tableId
    if (actionType === 'CREATE' || !targetTableId) return
    setRecLoading(true)
    try {
      const q = new URLSearchParams({ tableId: String(targetTableId), pageSize: '200' })
      const scope = f.specialAction?.dataScope
      if (scope?.length) q.set('scope', JSON.stringify(scope))
      const r = await fetch(`/api/approval/special-actions/records?${q}`)
      const j = await r.json()
      setRecords(j.data ?? [])
    } catch { setRecords([]) }
    finally { setRecLoading(false) }
  }

  const editableFieldDefs = active?.specialAction?.editableFields ?? []

  async function submit() {
    if (!active) return
    if (active.specialAction?.actionType !== 'CREATE' && !recId) { setError('请选择目标记录'); return }
    setSubmitting(true); setError('')
    try {
      const payload: any = {
        workflowId: active.id,
        actionType: active.specialAction?.actionType,
        recordId: recId ?? undefined,
      }
      if (active.specialAction?.actionType === 'CREATE' || active.specialAction?.actionType === 'UPDATE') {
        payload.formData = form
      }
      if (comment) payload.comment = comment
      const r = await fetch('/api/approval/special-actions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || j.message || '发起失败')
      alert('已发起审批')
      onOpenChange(false)
      onDone?.()
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  const previewLabel = (rec: RecordRow) => {
    const flds = (active?.specialAction?.editableFields ?? []).slice(0, 3)
    const parts = flds.map(f => rec.data?.[f.name] ?? '').filter(Boolean)
    return parts.length ? parts.join(' · ') : `记录 #${rec.id}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            发起专项审批
            <Badge variant="outline" className="text-slate-400 font-normal">{tableLabel || '数据表'}</Badge>
          </DialogTitle>
          <DialogDescription>
            选择要发起的专项动作审批流程{active ? '，填写内容后提交' : ''}。
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="whitespace-pre-wrap">{error}</span>
          </div>
        )}

        {!active ? (
          <div className="space-y-3">
            {flowLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />加载专项流程…
              </div>
            ) : flows.length === 0 ? (
              <div className="py-10 text-center text-slate-400 flex flex-col items-center gap-2">
                <AlertCircle className="w-8 h-8 text-slate-300" />
                <div>当前没有你可发起的专项动作审批。</div>
                <div className="text-xs">请管理员在「审批流程」中设计并发布专项动作审批。</div>
              </div>
            ) : (
              <div className="space-y-2">
                {flows.map(f => {
                  const meta = ACTION_META[f.specialAction?.actionType ?? 'CREATE']
                  const Icon = meta.icon
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => pick(f)}
                      className="w-full text-left border rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-8 h-8 rounded-lg grid place-items-center border shrink-0 ${meta.cls}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-800 truncate">{f.name}</span>
                            <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            目标：{f.targetTable?.label ?? '未配置'}
                            {editableFieldDefs.length > 0 && ` · 可编辑：${editableFieldDefs.map(x => x.label).join('、')}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 已选流程头 + 返回 */}
            <div className="flex items-center justify-between border-b pb-2 pr-1">
              <div className="flex items-center gap-2 min-w-0">
                {(() => { const m = ACTION_META[active.specialAction?.actionType ?? 'CREATE']; const Icon = m.icon; return (
                  <span className={`w-6 h-6 rounded-md grid place-items-center border ${m.cls}`}><Icon className="w-3.5 h-3.5" /></span>
                ) })()}
                <span className="text-sm font-medium text-slate-800 truncate">{active.name}</span>
              </div>
              <button type="button" onClick={reset} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 从目标记录发起：显示已锁定记录，无需再选 */}
            {active.specialAction?.actionType !== 'CREATE' && lockedRecord && (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                目标记录：已锁定当前记录 #{defaultRecordId}
              </div>
            )}

            {/* 非新增：选择目标记录（从记录发起时已锁定，不显示选择列表） */}
            {active.specialAction?.actionType !== 'CREATE' && !lockedRecord && (
              <div className="space-y-2">
                <Label>选择目标记录</Label>
                {recLoading ? (
                  <div className="text-sm text-slate-400 flex items-center gap-1 py-3">
                    <Loader2 className="w-4 h-4 animate-spin" />加载记录…
                  </div>
                ) : records.length === 0 ? (
                  <div className="text-sm text-slate-400 italic py-3">该项目暂无记录</div>
                ) : (
                  <div className="max-h-52 overflow-y-auto border rounded-lg divide-y">
                    {records.map(rec => (
                      <button
                        key={rec.id}
                        type="button"
                        onClick={() => { setRecId(rec.id); if (active.specialAction?.actionType === 'UPDATE') {
                          const fd: Record<string, string> = {}
                          for (const ef of active.specialAction.editableFields ?? []) fd[ef.name] = rec.data?.[ef.name] != null ? String(rec.data[ef.name]) : ''
                          setForm(fd)
                        } }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-slate-50 transition-colors ${recId === rec.id ? 'bg-indigo-50' : ''}`}
                      >
                        <span className="truncate">{previewLabel(rec)}</span>
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
                  {active.specialAction?.actionType === 'CREATE' ? '新增数据内容' : '修改字段内容（仅以下字段可编辑）'}
                </Label>
                {editableFieldDefs.length === 0 ? (
                  <div className="text-xs text-amber-600">该流程未配置可编辑字段，无法填写内容</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {editableFieldDefs.map(f => (
                      <div key={f.name} className="space-y-1">
                        <Label className="text-xs text-slate-500">{f.label}</Label>
                        <Input
                          value={form[f.name] ?? ''}
                          onChange={e => setForm(d => ({ ...d, [f.name]: e.target.value }))}
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

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          {active && (
            <Button onClick={submit} disabled={submitting} className="bg-indigo-600 hover:bg-indigo-700 text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <PlusCircle className="w-4 h-4 mr-1" />}
              提交审批
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}