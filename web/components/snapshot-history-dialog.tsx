"use client"

import { useState, useEffect, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChevronDown, ChevronRight, Clock, RefreshCw, History } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

/** 数据快照/变更历史对话框 —— 数据列表 & 记录详情页共用
 *  数据来源 GET /api/data/{tableName}/{recordId}/snapshots
 */
export function SnapshotHistoryDialog({
  open,
  onOpenChange,
  tableName,
  recordId,
  tableLabel = '',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  tableName: string
  recordId: number
  tableLabel?: string
}) {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async () => {
    if (!open) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/data/${tableName}/${recordId}/snapshots`)
      const j = await res.json()
      if (!res.ok) {
        setError(j.message || '加载失败')
        setLogs([])
      } else {
        setLogs(j.data || [])
      }
    } catch {
      setError('网络错误')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tableName, recordId])

  const toggle = (id: number) => setExpanded(expanded === id ? null : id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-row items-center justify-between pr-10">
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            数据快照 / 变更历史
            {tableLabel ? ` · ${tableLabel}` : ''}
            {recordId ? ` · 记录 #${recordId}` : ''}
          </DialogTitle>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={'w-4 h-4 mr-2 ' + (loading ? 'animate-spin' : '')} />
            刷新
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-auto pr-1 space-y-3">
          {loading && (
            <div className="text-center py-12 text-slate-500 text-sm">加载中...</div>
          )}
          {!loading && error && (
            <div className="text-center py-12 text-rose-600 text-sm">{error}</div>
          )}
          {!loading && !error && logs.length === 0 && (
            <div className="text-center py-12 text-slate-500 text-sm border border-dashed rounded-lg">
              该记录暂无变更历史（数据快照在记录的新增/修改/删除/同步/审批时生成）
            </div>
          )}
          {logs.map((log) => {
            const isOpen = expanded === log.id
            const label = actionMeta(log.action, log.module)
            const diffInfo = extractDiff(log)
            return (
              <Card key={log.id} className="overflow-hidden">
                <CardHeader className="py-2.5 cursor-pointer select-none" onClick={() => toggle(log.id)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                    <span className={`font-semibold text-sm ${label.color}`}>{label.text}</span>
                    {log.module && <Badge variant="outline" className="text-xs">{moduleLabel(log.module)}</Badge>}
                    {log.snapshot && (
                      <Badge variant="outline" className="text-xs">快照 #{log.snapshot.id}</Badge>
                    )}
                    {log.syncRequest && (
                      <Badge variant="outline" className="text-xs">同步 #{log.syncRequest.id} · {log.syncRequest.status}</Badge>
                    )}
                    {log.approvalInstance && (
                      <Badge variant="outline" className="text-xs">审批 #{log.approvalInstance.id} · {log.approvalInstance.status}</Badge>
                    )}
                    <span className="text-xs text-slate-500 ml-auto flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDateTime(log.createdAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 pl-6">
                    <span className="text-xs text-slate-500">
                      操作人：{log.user?.realName || log.user?.username || '—'}
                    </span>
                    {diffInfo.changes > 0 && (
                      <Badge variant="destructive" className="text-xs">变更字段 {diffInfo.changes}</Badge>
                    )}
                    {diffInfo.changes === 0 && !diffInfo.hasData && (
                      <Badge variant="outline" className="text-xs">无数据快照</Badge>
                    )}
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0">
                    {diffInfo.hasData ? (
                      <DiffTable before={diffInfo.before} after={diffInfo.after} />
                    ) : (
                      <div className="text-xs text-slate-400 py-3 text-center border border-dashed rounded-md">
                        该操作未记录字段级差异（如仅审批流转、状态变更等）
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 提取某条日志的 before/after 数据：
 *  优先用同步请求的 fieldDiffs（{field:{before,after}}），其次 DataSnapshot，其次 detail.before/after
 */
function extractDiff(log: any): { before: any; after: any; hasData: boolean; changes: number } {
  // 同步请求：真实字段差异在 fieldDiffs
  const fds = log.syncRequest?.fieldDiffs
  if (fds && typeof fds === 'object' && !Array.isArray(fds) && Object.keys(fds).length > 0) {
    const before: Record<string, any> = {}
    const after: Record<string, any> = {}
    for (const [f, e] of Object.entries(fds)) {
      before[f] = (e as any)?.before
      after[f] = (e as any)?.after
    }
    return { before, after, hasData: true, changes: Object.keys(fds).length }
  }
  // DataSnapshot
  if (log.snapshot) {
    const before = log.snapshot.beforeData
    const after = log.snapshot.afterData
    const hasData = before != null || after != null
    return { before, after, hasData, changes: changedCount(before, after) }
  }
  // 普通日志 detail.before/after
  const detail = log.detail && typeof log.detail === 'object' && !Array.isArray(log.detail) ? log.detail : null
  const before = detail?.before ?? null
  const after = detail?.after ?? null
  const hasData = before != null || after != null
  return { before, after, hasData, changes: changedCount(before, after) }
}

function changedCount(before: any, after: any): number {
  try {
    const keys = new Set<string>()
    const walk = (o: any) => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { keys.add(k); walk(o[k]) } }
    walk(before); walk(after)
    let c = 0
    for (const k of keys) if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) c++
    return c
  } catch { return 0 }
}

function DiffTable({ before, after }: { before: any; after: any }) {
  const keys = useMemo(() => {
    const s = new Set<string>()
    const walk = (o: any) => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { s.add(k); walk(o[k]) } }
    walk(before); walk(after); return Array.from(s)
  }, [before, after])

  const rows = keys.map(k => {
    const b = JSON.stringify(before?.[k])
    const a = JSON.stringify(after?.[k])
    return { key: k, before: b, after: a, eq: b === a }
  })

  return (
    <div className="border rounded-md max-h-[50vh] overflow-auto">
      <Table>
        <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
          <TableRow>
            <TableHead className="w-52">字段</TableHead>
            <TableHead>修改前（before）</TableHead>
            <TableHead>修改后（after）</TableHead>
            <TableHead className="w-16 text-center">状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.key} className={r.eq ? '' : 'bg-rose-50/60'}>
              <TableCell className="font-mono text-xs align-top break-all">{r.key}</TableCell>
              <TableCell className="align-top text-xs">
                <pre className="whitespace-pre-wrap break-words">{r.before ?? <span className="text-slate-400">（空）</span>}</pre>
              </TableCell>
              <TableCell className="align-top text-xs">
                <pre className="whitespace-pre-wrap break-words">{r.after ?? <span className="text-slate-400">（空）</span>}</pre>
              </TableCell>
              <TableCell className="text-center align-top">
                {r.eq ? <Badge variant="outline" className="text-xs">未变</Badge> : <Badge variant="destructive" className="text-xs">修改</Badge>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

const ACTION_LABEL: Record<string, { text: string; color: string }> = {
  CREATE_RECORD: { text: '新增记录', color: 'text-emerald-600' },
  UPDATE_RECORD: { text: '修改记录', color: 'text-amber-600' },
  DELETE_RECORD: { text: '删除记录', color: 'text-rose-600' },
  BATCH_DELETE_RECORDS: { text: '批量删除', color: 'text-rose-600' },
  'SYNC_REQUEST.SUBMIT': { text: '提交同步', color: 'text-sky-600' },
  'APPROVAL_V2.START': { text: '发起审批', color: 'text-indigo-600' },
  'APPROVAL_V2.LEVY_SAVE_AUTO_TRIGGER': { text: '征收保存自动发起审批', color: 'text-indigo-600' },
  APPROVE: { text: '审批通过', color: 'text-emerald-600' },
  REJECT: { text: '审批驳回', color: 'text-rose-600' },
  TRANSFER: { text: '转签', color: 'text-sky-600' },
  ADD_COUNTERSIGN: { text: '加签', color: 'text-indigo-600' },
  REVOKE: { text: '撤回', color: 'text-slate-600' },
  RESTART: { text: '驳回重提', color: 'text-orange-600' },
}

function actionMeta(action: string | null | undefined, module: string | null | undefined): { text: string; color: string } {
  if (action && ACTION_LABEL[action]) return ACTION_LABEL[action]
  return { text: action || '操作', color: 'text-slate-600' }
}

function moduleLabel(module: string): string {
  switch (module) {
    case 'DATA': return '数据'
    case 'SYNC': return '同步'
    case 'APPROVAL_V2': return '审批'
    case 'AUTH': return '登录'
    case 'EXPORT':
    case 'DOCUMENT':
    case 'DOCX':
    case 'PRINT': return '文书'
    default: return module
  }
}
