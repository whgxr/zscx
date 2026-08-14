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
import {
  ChevronLeft, ChevronRight, Search, RefreshCw, Eye, Send, History, CheckCircle2, XCircle, Clock,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { STATUS_COLOR, STATUS_LABEL, buildDiff, parseSpecialActionOf } from '@/lib/approval-display'

type AnyRow = any

const ACTION_LABEL: Record<string, string> = {
  APPROVE: '通过', REJECT: '驳回', TRANSFER: '转签',
  ADD_COUNTERSIGN: '加签', TIMEOUT_PASS: '超时通过', TIMEOUT_REJECT: '超时驳回',
}

interface InstancesViewProps {
  scope: string
  title: string
  subtitle: string
}

export function InstancesView({ scope, title, subtitle }: InstancesViewProps) {
  const [rows, setRows] = useState<AnyRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<string>('ALL')
  const [timelineRow, setTimelineRow] = useState<AnyRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ scope, page: String(page), pageSize: String(pageSize) })
      if (keyword) q.set('keyword', keyword)
      if (status && status !== 'ALL') q.set('status', status)
      const res = await fetch(`/api/approval/v2/instances?${q.toString()}`)
      const json = await res.json()
      if (json.ok) { setRows(json.data ?? []); setTotal(json.total ?? 0) }
      else alert(json.error)
    } finally { setLoading(false) }
  }, [scope, page, keyword, status, pageSize])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const currentNodeSummary = (row: AnyRow) => {
    const open = row.nodeInstances.filter((n: any) => ['PENDING'].includes(n.status))
    if (!open.length) return '—'
    return open.map((n: any) => `${n.node.nodeName}${n.assignee ? ' · ' + (n.assignee.realName || n.assignee.username) : ''}`).join('，')
  }

  const getTimeline = (row: AnyRow) => {
    const chain = typeof row.approvalChain === 'string' ? JSON.parse(row.approvalChain) : row.approvalChain
    if (Array.isArray(chain)) return chain
    return row.nodeInstances
      .filter((n: any) => n.processedAt)
      .sort((a: any, b: any) => new Date(a.processedAt!).getTime() - new Date(b.processedAt!).getTime())
      .map((n: any) => ({
        nodeName: n.node.nodeName,
        action: n.action ?? n.status,
        comment: n.comment,
        processedAt: n.processedAt,
        userName: n.assignee?.realName || n.assignee?.username || '系统',
      }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">{subtitle}。共 {total} 条。</p>
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
              <TableHead>申请内容</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>发起时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-10">加载中…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-slate-400 py-10">暂无记录</TableCell></TableRow>}
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
                <TableCell className="text-sm">{r.initiator.realName || r.initiator.username}</TableCell>
                <TableCell className="text-sm text-slate-700 max-w-xs truncate">{currentNodeSummary(r)}</TableCell>
                <TableCell className="max-w-xs">
                  {(() => {
                    const diffs = buildDiff(r)
                    const sa = parseSpecialActionOf(r)
                    const actionType = sa?.actionType ?? 'UPDATE'
                    if (actionType === 'DELETE') {
                      return <span className="text-xs text-rose-600 font-medium">删除记录</span>
                    }
                    if (actionType === 'REVIEW') {
                      return <span className="text-xs text-sky-600 font-medium">审查复核</span>
                    }
                    if (actionType === 'CREATE') {
                      return <div className="text-xs text-slate-600 line-clamp-2 space-y-0.5">
                        {diffs.length === 0 ? <span className="text-slate-400">新增记录</span> :
                          diffs.slice(0, 3).map((d, i) => (
                            <div key={i} className="truncate"><b className="text-slate-800">{d.label}</b>：<span className="text-emerald-700">{d.newVal || '—'}</span></div>
                          ))}
                      </div>
                    }
                    return <div className="text-xs text-slate-600 line-clamp-2 space-y-0.5">
                      {diffs.length === 0 ? <span className="text-slate-400">（无字段变更）</span> :
                        diffs.slice(0, 3).map((d, i) => (
                          <div key={i} className="truncate">
                            <b className="text-slate-800">{d.label}</b>：
                            <span className="text-slate-400 line-through">{d.oldVal}</span>
                            <span className="text-slate-400"> → </span>
                            <span className="text-emerald-700">{d.newVal || '（清空）'}</span>
                          </div>
                        ))}
                      {diffs.length > 3 && <div className="text-slate-400">…共 {diffs.length} 项变更</div>}
                    </div>
                  })()}
                </TableCell>
                <TableCell><Badge variant="outline" className={STATUS_COLOR[r.status] ?? ''}>{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                <TableCell className="text-xs text-slate-500">{formatDateTime(r.startedAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1.5 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => setTimelineRow(r)} title="审批时间线">
                      <History className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/dashboard/data/${r.table.name}/${r.record.id}`}>
                        <Eye className="w-4 h-4 mr-1" />记录
                      </Link>
                    </Button>
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
