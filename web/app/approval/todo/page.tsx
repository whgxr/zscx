'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock, Search, RefreshCw,
  Eye, Send, Loader2, ArrowRightLeft, UserPlus, History,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

type NodeInstance = {
  id: number
  nodeId: number
  assigneeId?: number | null
  status: string
  action?: string | null
  comment?: string | null
  processedAt?: string | null
  countersignTotal?: number | null
  countersignApprovedCount?: number | null
  node: { id: number; nodeKey?: string | null; nodeName: string; nodeType: string }
  assignee?: { id: number; realName?: string | null; username: string; avatar?: string | null } | null
}

type AnyRow = {
  id: number
  status: string
  startedAt: string
  completedAt?: string | null
  triggerEvent?: string | null
  approvalChain?: any
  workflow: { id: number; name: string; version?: number | null }
  table: { id: number; label: string; name: string }
  record: { id: number; status?: string; updatedAt?: string }
  initiator: { id: number; realName?: string | null; username: string; avatar?: string | null }
  nodeInstances: NodeInstance[]
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  PROCESSING: 'bg-sky-100 text-sky-800 border-sky-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  REVOKED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
  AUTO_PASSED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  AUTO_REJECTED: 'bg-rose-100 text-rose-800 border-rose-200',
  RESTARTED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
}

const ACTION_LABEL: Record<string, string> = {
  APPROVE: '通过', REJECT: '驳回', TRANSFER: '转签',
  ADD_COUNTERSIGN: '加签', TIMEOUT_PASS: '超时通过', TIMEOUT_REJECT: '超时驳回',
}

export default function TodoPage() {
  const [rows, setRows] = useState<AnyRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string>('ALL')
  const [recordId, setRecordId] = useState('')

  // ── 审批弹窗 ──
  const [actionRow, setActionRow] = useState<AnyRow | null>(null)
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | 'TRANSFER'>('APPROVE')
  const [actionComment, setActionComment] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  // ── 时间线弹窗 ──
  const [timelineRow, setTimelineRow] = useState<AnyRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ scope: 'pending', page: String(page), pageSize: String(pageSize) })
      if (keyword) q.set('keyword', keyword)
      if (status && status !== 'ALL') q.set('status', status)
      if (recordId) q.set('recordId', recordId)
      const res = await fetch(`/api/approval/v2/instances?${q.toString()}`)
      const json = await res.json()
      if (json.ok) { setRows(json.data ?? []); setTotal(json.total ?? 0) }
      else alert(json.error)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, status])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const currentNodeSummary = (row: AnyRow) => {
    const open = row.nodeInstances.filter(n => ['PENDING', 'APPROVING', 'COUNTERSIGNING'].includes(n.status))
    if (!open.length) return '—'
    return open.map(n => `${n.node.nodeName}${n.assignee ? ' · ' + (n.assignee.realName || n.assignee.username) : ''}`).join('，')
  }

  const myPendingNodes = (row: AnyRow) =>
    row.nodeInstances.filter(n => ['PENDING', 'APPROVING', 'COUNTERSIGNING'].includes(n.status))

  const openAction = (row: AnyRow, type: 'APPROVE' | 'REJECT' | 'TRANSFER') => {
    setActionRow(row)
    setActionType(type)
    setActionComment('')
  }

  const doAction = async () => {
    if (!actionRow) return
    const pending = myPendingNodes(actionRow)
    if (!pending.length) return alert('没有可处理的节点')
    setActionLoading(true)
    try {
      const r = await fetch('/api/approval/v2/node-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: actionRow.id,
          nodeInstanceId: pending[0].id,
          action: actionType,
          comment: actionComment || undefined,
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error ?? '操作失败')
      setActionRow(null)
      load()
    } catch (e) {
      alert((e as Error).message)
    } finally { setActionLoading(false) }
  }

  // ── 解析 approvalChain 用于时间线 ──
  const getTimeline = (row: AnyRow) => {
    const chain = typeof row.approvalChain === 'string' ? JSON.parse(row.approvalChain) : row.approvalChain
    if (Array.isArray(chain)) return chain
    // fallback: 用 nodeInstances 构建
    return row.nodeInstances
      .filter(n => n.processedAt)
      .sort((a, b) => new Date(a.processedAt!).getTime() - new Date(b.processedAt!).getTime())
      .map(n => ({
        nodeName: n.node.nodeName,
        action: n.action ?? n.status,
        comment: n.comment,
        processedAt: n.processedAt,
        userName: n.assignee?.realName || n.assignee?.username || '系统',
      }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">我的待办审批</h1>
          <p className="text-sm text-slate-500 mt-1">需要你处理的审批节点。共 {total} 条。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
      </div>

      <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end">
        <div className="w-64 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">搜索</label>
          <Input placeholder="编号 / 发起人姓名 / 用户名" value={keyword} onChange={e => setKeyword(e.target.value)} />
        </div>
        <div className="w-40 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">状态</label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部</SelectItem>
              <SelectItem value="PENDING">处理中</SelectItem>
              <SelectItem value="APPROVED">已通过</SelectItem>
              <SelectItem value="REJECTED">已驳回</SelectItem>
              <SelectItem value="REVOKED">已撤回</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">记录编号</label>
          <Input type="number" placeholder="record id" value={recordId} onChange={e => setRecordId(e.target.value)} />
        </div>
        <Button onClick={load}><Search className="w-4 h-4 mr-2" />查询</Button>
      </CardContent></Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>表 · 记录</TableHead>
              <TableHead>流程</TableHead>
              <TableHead>发起人</TableHead>
              <TableHead>当前节点</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>发起时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">加载中…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">暂无待办，辛苦啦 🎉</TableCell></TableRow>}
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs text-slate-600">#{r.id}</TableCell>
                <TableCell>
                  <div className="text-sm">{r.table.label}</div>
                  <div className="text-xs text-slate-500">record #{r.record.id}</div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{r.workflow.name}</div>
                  <div className="text-xs text-slate-500">v{r.workflow.version ?? 1}{r.triggerEvent ? ' · ' + r.triggerEvent : ''}</div>
                </TableCell>
                <TableCell className="text-sm">{r.initiator.realName || r.initiator.username}</TableCell>
                <TableCell className="text-sm text-slate-700 max-w-xs truncate">{currentNodeSummary(r)}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLOR[r.status] ?? ''}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs text-slate-500">{formatDateTime(r.startedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1.5 justify-end flex-wrap">
                    <Button size="sm" variant="ghost" onClick={() => setTimelineRow(r)} title="审批时间线">
                      <History className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/data/${r.table.name}/${r.record.id}`}>
                        <Eye className="w-4 h-4 mr-1" />记录
                      </Link>
                    </Button>
                    {myPendingNodes(r).length > 0 && (
                      <>
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openAction(r, 'APPROVE')}>
                          <CheckCircle2 className="w-4 h-4 mr-1" />通过
                        </Button>
                        <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => openAction(r, 'REJECT')}>
                          <XCircle className="w-4 h-4 mr-1" />驳回
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <div className="text-sm text-slate-500">共 {total} 条 · 第 {page}/{totalPages} 页</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 内联审批弹窗 ── */}
      <Dialog open={!!actionRow} onOpenChange={(v) => { if (!v) setActionRow(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionType === 'APPROVE' ? '✅ 审批通过' : actionType === 'REJECT' ? '❌ 驳回审批' : '🔄 转签'}
              {actionRow && <span className="text-sm font-normal text-slate-500 ml-2">#{actionRow.id}</span>}
            </DialogTitle>
            <DialogDescription>
              {actionRow && `${actionRow.workflow.name} · ${actionRow.initiator.realName || actionRow.initiator.username} 发起`}
            </DialogDescription>
          </DialogHeader>
          {actionRow && (
            <>
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">表</span>
                  <span>{actionRow.table.label} · record #{actionRow.record.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">当前节点</span>
                  <span>{currentNodeSummary(actionRow)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>审批意见（可选）</Label>
                <Textarea
                  rows={3}
                  placeholder={actionType === 'APPROVE' ? '如：同意，请继续推进。' : '请填写驳回原因…'}
                  value={actionComment}
                  onChange={e => setActionComment(e.target.value)}
                />
              </div>
            </>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionRow(null)}>取消</Button>
            <Button
              onClick={doAction}
              disabled={actionLoading}
              className={actionType === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : actionType === 'REJECT' ? 'bg-rose-600 hover:bg-rose-700' : ''}
            >
              {actionLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              确认{actionType === 'APPROVE' ? '通过' : actionType === 'REJECT' ? '驳回' : '转签'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 审批时间线弹窗 ── */}
      <Dialog open={!!timelineRow} onOpenChange={(v) => { if (!v) setTimelineRow(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>审批时间线</DialogTitle>
            <DialogDescription>
              {timelineRow && `#${timelineRow.id} · ${timelineRow.workflow.name}`}
            </DialogDescription>
          </DialogHeader>
          {timelineRow && (
            <div className="space-y-0 max-h-96 overflow-y-auto">
              {/* 发起节点 */}
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 grid place-items-center">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="w-0.5 flex-1 bg-slate-200 my-1" />
                </div>
                <div className="pb-4">
                  <div className="text-sm font-medium">{timelineRow.initiator.realName || timelineRow.initiator.username} 发起审批</div>
                  <div className="text-xs text-slate-500">{formatDateTime(timelineRow.startedAt)}</div>
                </div>
              </div>
              {/* 各审批节点 */}
              {getTimeline(timelineRow).map((step: any, i: number) => {
                const isApprove = ['APPROVE', 'AUTO_PASSED', 'TIMEOUT_PASS'].includes(step.action)
                const isReject = ['REJECT', 'AUTO_REJECTED', 'TIMEOUT_REJECT'].includes(step.action)
                return (
                  <div key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full grid place-items-center ${
                        isApprove ? 'bg-emerald-100 text-emerald-600' :
                        isReject ? 'bg-rose-100 text-rose-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {isApprove ? <CheckCircle2 className="w-4 h-4" /> :
                         isReject ? <XCircle className="w-4 h-4" /> :
                         <Clock className="w-4 h-4" />}
                      </div>
                      {i < getTimeline(timelineRow).length - 1 && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                    </div>
                    <div className="pb-4 min-w-0">
                      <div className="text-sm font-medium">
                        {step.nodeName || `节点${i + 1}`}
                        <span className="ml-2 text-xs text-slate-500">
                          {ACTION_LABEL[step.action] ?? step.action ?? step.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {step.userName || ''} {step.processedAt ? '· ' + formatDateTime(step.processedAt) : ''}
                      </div>
                      {step.comment && (
                        <div className="mt-1 text-xs bg-slate-50 rounded px-2 py-1 text-slate-600 italic">"{step.comment}"</div>
                      )}
                    </div>
                  </div>
                )
              })}
              {/* 当前状态 */}
              {['APPROVED'].includes(timelineRow.status) && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white grid place-items-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-emerald-700">审批完成</div>
                    <div className="text-xs text-slate-500">{timelineRow.completedAt ? formatDateTime(timelineRow.completedAt) : ''}</div>
                  </div>
                </div>
              )}
              {getTimeline(timelineRow).length === 0 && (
                <div className="text-sm text-slate-400 pl-11">暂无审批记录。</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTimelineRow(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
