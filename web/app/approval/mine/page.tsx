'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ChevronLeft, ChevronRight, Search, RefreshCw, Eye, Undo2,
  CheckCircle2, XCircle, Clock, AlertCircle, Loader2,
} from 'lucide-react'
import { formatDateTime, cn } from '@/lib/utils'

type AnyRow = any

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

const NODE_STATUS_ICON: Record<string, { icon: any; cls: string }> = {
  APPROVED:          { icon: CheckCircle2, cls: 'text-emerald-500' },
  REJECTED:          { icon: XCircle,      cls: 'text-rose-500' },
  AUTO_PASSED:       { icon: CheckCircle2, cls: 'text-emerald-400' },
  AUTO_REJECTED:     { icon: XCircle,      cls: 'text-rose-400' },
  TIMEOUT_PASS:      { icon: Clock,        cls: 'text-amber-500' },
  TIMEOUT_REJECT:    { icon: Clock,        cls: 'text-amber-500' },
  TRANSFERRED:       { icon: AlertCircle,  cls: 'text-blue-500' },
  PENDING:           { icon: Clock,        cls: 'text-slate-400' },
  APPROVING:         { icon: Clock,        cls: 'text-sky-500' },
  COUNTERSIGNING:    { icon: Clock,        cls: 'text-sky-500' },
}

export default function MinePage() {
  const [rows, setRows] = useState<AnyRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string>('ALL')
  // ── 撤回确认弹窗 ──
  const [revokeRow, setRevokeRow] = useState<AnyRow | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revokeLoading, setRevokeLoading] = useState(false)
  // ── 节点进度弹窗 ──
  const [progressRow, setProgressRow] = useState<AnyRow | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ scope: 'mine', page: String(page), pageSize: String(pageSize) })
      if (keyword) q.set('keyword', keyword)
      if (status && status !== 'ALL') q.set('status', status)
      const res = await fetch(`/api/approval/v2/instances?${q.toString()}`)
      const json = await res.json()
      if (json.ok) { setRows(json.data ?? []); setTotal(json.total ?? 0) }
      else alert(json.error)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, status])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const revoke = async () => {
    if (!revokeRow) return
    setRevokeLoading(true)
    try {
      const r = await fetch(`/api/approval/v2/instances/${revokeRow.id}/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revokeReason || '发起人手动撤回' }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error ?? '撤回失败')
      setRevokeRow(null)
      setRevokeReason('')
      load()
    } catch (e) {
      alert((e as Error).message)
    } finally { setRevokeLoading(false) }
  }

  const progress = (r: AnyRow) => {
    const nodes = (r.nodeInstances ?? [])
    if (!nodes.length) return 0
    const done = nodes.filter((n: any) =>
      n.processedAt || ['APPROVED','REJECTED','AUTO_PASSED','AUTO_REJECTED','TRANSFERRED','TIMEOUT_PASS','TIMEOUT_REJECT'].includes(n.action ?? '')
    ).length
    return Math.round(done / nodes.length * 100)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">我发起的审批</h1>
          <p className="text-sm text-slate-500 mt-1">我提交过的所有审批流程。共 {total} 条。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
      </div>

      <Card><CardContent className="p-4 flex flex-wrap gap-3 items-end">
        <div className="w-64 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">搜索</label>
          <Input placeholder="编号 / 发起人" value={keyword} onChange={e => setKeyword(e.target.value)} />
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
        <Button onClick={load}><Search className="w-4 h-4 mr-2" />查询</Button>
      </CardContent></Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>编号</TableHead>
              <TableHead>表 · 记录</TableHead>
              <TableHead>流程</TableHead>
              <TableHead>进度</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>发起时间</TableHead>
              <TableHead>完成时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">加载中…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-10">暂无记录</TableCell></TableRow>}
            {rows.map((r: AnyRow) => (
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
                <TableCell className="w-52">
                  <button
                    className="w-full text-left group cursor-pointer"
                    onClick={() => setProgressRow(r)}
                    title="点击查看节点详情"
                  >
                    {/* 进度条 + 节点小圆点 */}
                    <div className="flex items-center gap-1 mb-1">
                      {(r.nodeInstances ?? []).slice(0, 8).map((ni: any, i: number) => {
                        const info = NODE_STATUS_ICON[ni.action ?? ni.status] ?? { icon: Clock, cls: 'text-slate-300' }
                        const Icon = info.icon
                        return <Icon key={i} className={cn('w-3.5 h-3.5 shrink-0', info.cls)} />
                      })}
                      {(r.nodeInstances ?? []).length > 8 && <span className="text-[10px] text-slate-400">+{(r.nodeInstances ?? []).length - 8}</span>}
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          r.status === 'REJECTED' || r.status === 'AUTO_REJECTED' ? 'bg-rose-400' :
                          r.status === 'APPROVED' ? 'bg-emerald-500' :
                          'bg-indigo-500'
                        )}
                        style={{ width: `${progress(r)}%` }}
                      />
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 group-hover:text-indigo-600 transition-colors">{progress(r)}% · 点击查看详情</div>
                  </button>
                </TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLOR[r.status] ?? ''}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs text-slate-500">{formatDateTime(r.startedAt)}</TableCell>
                <TableCell className="text-xs text-slate-500">{r.completedAt ? formatDateTime(r.completedAt) : '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-2 justify-end">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/data/${r.table.name}/${r.record.id}`}>
                        <Eye className="w-4 h-4 mr-1" />详情
                      </Link>
                    </Button>
                    {['PENDING','PROCESSING'].includes(r.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-amber-700 border-amber-200 hover:bg-amber-50 font-medium"
                        onClick={() => { setRevokeRow(r); setRevokeReason('') }}
                      >
                        <Undo2 className="w-4 h-4 mr-1" />撤回
                      </Button>
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

      {/* ── 撤回确认弹窗 ── */}
      <Dialog open={!!revokeRow} onOpenChange={(v) => { if (!v) setRevokeRow(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-amber-600" />
              确认撤回审批流程
            </DialogTitle>
            <DialogDescription>
              撤回后流程状态变更为 REVOKED，需要重新提交。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          {revokeRow && (
            <div className="space-y-3">
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm">
                <div className="font-medium text-amber-800">{revokeRow.workflow.name}</div>
                <div className="text-xs text-amber-600 mt-1">
                  #{revokeRow.id} · {revokeRow.table.label} · record #{revokeRow.record.id}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-600">撤回原因（可选）</label>
                <Input
                  placeholder="如：信息有误，需要修改后重新提交"
                  value={revokeReason}
                  onChange={e => setRevokeReason(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeRow(null)}>取消</Button>
            <Button
              onClick={revoke}
              disabled={revokeLoading}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {revokeLoading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Undo2 className="w-4 h-4 mr-1" />}
              确认撤回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 节点进度详情弹窗 ── */}
      <Dialog open={!!progressRow} onOpenChange={(v) => { if (!v) setProgressRow(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>流程节点进度</DialogTitle>
            <DialogDescription>
              {progressRow && `#${progressRow.id} · ${progressRow.workflow.name}`}
            </DialogDescription>
          </DialogHeader>
          {progressRow && (
            <div className="space-y-0 max-h-96 overflow-y-auto">
              {(progressRow.nodeInstances ?? []).map((ni: any, i: number, arr: any[]) => {
                const isDone = !!ni.processedAt || ['APPROVED','REJECTED','AUTO_PASSED','AUTO_REJECTED','TRANSFERRED','TIMEOUT_PASS','TIMEOUT_REJECT'].includes(ni.action ?? '')
                const isCurrent = ['PENDING','APPROVING','COUNTERSIGNING'].includes(ni.status) && !isDone
                const info = NODE_STATUS_ICON[ni.action ?? ni.status] ?? { icon: Clock, cls: 'text-slate-300' }
                const Icon = info.icon
                return (
                  <div key={ni.id ?? i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        'w-8 h-8 rounded-full grid place-items-center',
                        isDone ? 'bg-emerald-50' : isCurrent ? 'bg-sky-50 ring-2 ring-sky-200' : 'bg-slate-50'
                      )}>
                        <Icon className={cn('w-4 h-4', info.cls)} />
                      </div>
                      {i < arr.length - 1 && <div className={cn('w-0.5 flex-1 my-1', isDone ? 'bg-emerald-200' : 'bg-slate-200')} />}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{ni.node?.nodeName ?? `节点${i + 1}`}</span>
                        <Badge variant="outline" className={cn('text-[10px] h-5', STATUS_COLOR[ni.action ?? ni.status] ?? '')}>
                          {ni.action ?? ni.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {ni.assignee ? (ni.assignee.realName || ni.assignee.username) : '系统'}
                        {ni.processedAt ? ' · ' + formatDateTime(ni.processedAt) : ''}
                        {ni.countersignTotal ? ` · ${ni.countersignApprovedCount ?? 0}/${ni.countersignTotal} 已签` : ''}
                      </div>
                      {ni.comment && (
                        <div className="mt-1 text-xs bg-slate-50 rounded px-2 py-1 text-slate-600 italic">"{ni.comment}"</div>
                      )}
                    </div>
                  </div>
                )
              })}
              {(progressRow.nodeInstances ?? []).length === 0 && (
                <div className="text-sm text-slate-400 text-center py-6">暂无节点实例数据。</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProgressRow(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
