"use client"

import React, { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ChevronLeft, ChevronRight, ChevronDown, Search, Database, UserCheck, RefreshCw, FileText, LogIn, Eye, Clock, Shield,
  RotateCcw, Filter,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

type TabKey = 'data' | 'approval' | 'sync' | 'document' | 'auth'

const TABS: { key: TabKey; label: string; icon: React.ComponentType<any>; hint: string }[] = [
  { key: 'data', label: '数据操作', icon: Database, hint: '记录新增 / 修改 / 删除（含调查与征收）' },
  { key: 'approval', label: '审批记录', icon: UserCheck, hint: '审批流程发起 / 通过 / 驳回 / 加签 / 转签' },
  { key: 'sync', label: '同步记录', icon: RefreshCw, hint: '调查 ↔ 征收 同步请求 / 审批 / 生效' },
  { key: 'document', label: '文档生成 / 打印', icon: FileText, hint: 'Word / Excel / PDF 生成 / 下载 / 打印' },
  { key: 'auth', label: '登录 / 登出', icon: LogIn, hint: '登录 / 登出 / 密码修改 / 失败' },
]

interface LogRow {
  id: number; userId: number | null; action: string; module: string;
  tableId: number | null; recordId: number | null; snapshotId: number | null;
  syncRequestId: number | null; approvalInstanceId: number | null;
  detail: any; ipAddress: string | null; userAgent: string | null;
  createdAt: string;
  user: { id: number; username: string; realName: string; avatar: string | null } | null;
  snapshot: { id: number; beforeData: any; afterData: any; changeType: string | null; createdAt: string; changedBy: number | null } | null;
  syncRequest: { id: number; status: string; source: string | null; surveyTableId: number | null; levyTableId: number | null } | null;
  table: { id: number; name: string; label: string; categoryId: number | null } | null;
  approvalInstance: { id: number; status: string } | null;
}

const STATUS_BADGE: Record<string, { v: 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning'; label: string }> = {
  PENDING: { v: 'secondary', label: '待处理' },
  APPROVING: { v: 'warning', label: '审批中' },
  PASSED: { v: 'success', label: '通过' },
  APPROVED: { v: 'success', label: '通过' },
  REJECTED: { v: 'destructive', label: '驳回' },
  CANCELLED: { v: 'outline', label: '已撤销' },
  COMPLETED: { v: 'success', label: '完成' },
}
function badgeFor(s?: string | null) {
  if (!s) return null
  const k = STATUS_BADGE[s] ?? { v: 'outline' as const, label: s }
  return <Badge variant={k.v as any} className="text-xs">{k.label}</Badge>
}

const ACTION_OPTIONS: Record<TabKey, { value: string; label: string }[]> = {
  data: [
    { value: 'CREATE_RECORD', label: '新增记录' },
    { value: 'UPDATE_RECORD', label: '修改记录' },
    { value: 'DELETE_RECORD', label: '删除记录' },
    { value: 'DATA_BATCH_IMPORT', label: '批量导入' },
    { value: 'APPROVAL_V2.START', label: '发起审批' },
    { value: 'SYNC_REQUEST.SUBMIT', label: '提交同步' },
  ],
  approval: [
    { value: 'APPROVAL_V2.START', label: '发起审批' },
    { value: 'APPROVAL_V2.APPROVE', label: '通过' },
    { value: 'APPROVAL_V2.REJECT', label: '驳回' },
    { value: 'APPROVAL_V2.TRANSFER', label: '转签' },
    { value: 'APPROVAL_V2.COUNTERSIGN_ADD', label: '加签' },
    { value: 'APPROVAL_V2.CANCEL', label: '撤回' },
  ],
  sync: [
    { value: 'SYNC_REQUEST.SUBMIT', label: '提交同步' },
    { value: 'SYNC_REQUEST.APPROVE', label: '同步通过' },
    { value: 'SYNC_REQUEST.REJECT', label: '同步驳回' },
    { value: 'SYNC_REQUEST.APPLY', label: '同步生效' },
  ],
  document: [
    { value: 'DOC_PREVIEW', label: '预览文书' },
    { value: 'DOC_DOWNLOAD', label: '下载文书' },
    { value: 'DOC_PRINT', label: '打印文书' },
    { value: 'EXPORT_EXCEL', label: '导出 Excel' },
    { value: 'EXPORT_PDF', label: '导出 PDF' },
  ],
  auth: [
    { value: 'LOGIN', label: '登录' },
    { value: 'LOGOUT', label: '登出' },
    { value: 'LOGIN_FAIL', label: '登录失败' },
    { value: 'CHANGE_PASSWORD', label: '修改密码' },
    { value: 'TOKEN_REFRESH', label: '刷新 Token' },
  ],
}

const MODULE_OPTIONS = [
  'DATA', 'SURVEY', 'LEVY', 'RECORD',
  'APPROVAL', 'APPROVAL_V2',
  'SYNC', 'EXPORT', 'DOCUMENT', 'PRINT', 'DOCX',
  'AUTH', 'PERMISSIONS', 'SETTINGS', 'TABLES', 'ROLES', 'USERS',
]

export function AuditCenterClient() {
  const [tab, setTab] = useState<TabKey>('data')
  const [rows, setRows] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [keyword, setKeyword] = useState('')
  const [userId, setUserId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [detailOpen, setDetailOpen] = useState<LogRow | null>(null)
  // 高级过滤
  const [advOpen, setAdvOpen] = useState(false)
  const [module, setModule] = useState('')
  const [action, setAction] = useState('')
  const [tableId, setTableId] = useState('')
  const [recordId, setRecordId] = useState('')
  const [approvalInstanceId, setApprovalInstanceId] = useState('')
  const [syncRequestId, setSyncRequestId] = useState('')
  const [tables, setTables] = useState<{ id: number; label: string; name: string }[]>([])

  const reload = useMemo(() => async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) })
      if (keyword) params.set('keyword', keyword)
      if (userId) params.set('userId', userId)
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (module) params.set('module', module)
      if (action) params.set('action', action)
      if (tableId) params.set('tableId', tableId)
      if (recordId) params.set('recordId', recordId)
      if (approvalInstanceId) params.set('approvalInstanceId', approvalInstanceId)
      if (syncRequestId) params.set('syncRequestId', syncRequestId)
      const r = await fetch(`/api/audit-logs?${params}`)
      const d = await r.json()
      if (!r.ok || !d.ok) throw new Error(d.error ?? d.message ?? '查询失败')
      setRows(d.data ?? []); setTotal(d.total ?? 0)
    } catch (e: any) { alert(e.message) } finally { setLoading(false) }
  }, [tab, page, pageSize, keyword, userId, from, to, module, action, tableId, recordId, approvalInstanceId, syncRequestId])

  useEffect(() => { reload() }, [reload])

  // 首次挂载拉取表字典
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/tables?simple=1')
        const d = await r.json()
        if (r.ok && d.ok) setTables(d.data ?? [])
      } catch (_) { /* ignore */ }
    })()
  }, [])

  function resetFilters() {
    setKeyword(''); setUserId(''); setFrom(''); setTo(''); setModule(''); setAction('')
    setTableId(''); setRecordId(''); setApprovalInstanceId(''); setSyncRequestId(''); setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600" />
          <h1 className="text-2xl font-bold">审计日志中心</h1>
          <Badge variant="outline" className="ml-1">超级管理员视图 · 共 {total} 条</Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="h-9 pl-8 w-full" placeholder="关键词（操作 / 详情 / 用户名 / IP）"
              value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>
          <div className="w-32"><Input className="h-9" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <span className="text-slate-400">至</span>
          <div className="w-32"><Input className="h-9" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="w-32"><Input className="h-9" placeholder="userId" value={userId} onChange={e => setUserId(e.target.value)} /></div>
          <Select value={String(pageSize)} onValueChange={(v: any) => setPageSize(Number(v))}>
            <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20 / 页</SelectItem>
              <SelectItem value="50">50 / 页</SelectItem>
              <SelectItem value="100">100 / 页</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9" onClick={reload}><RefreshCw className="w-4 h-4 mr-1" />刷新</Button>
          <Button size="sm" variant="outline" className="h-9" onClick={resetFilters}><RotateCcw className="w-4 h-4 mr-1" />重置</Button>
        </div>
      </div>

      <div className={'border rounded-xl p-3 bg-slate-50/50 transition ' + (advOpen ? '' : '')}>
        <Button variant="ghost" size="sm" className="w-full justify-between h-8 px-2 hover:bg-transparent mb-1"
          onClick={() => setAdvOpen(v => !v)}>
          <div className="flex items-center gap-2 text-slate-600"><Filter className="w-4 h-4" />高级筛选（模块 / 动作 / 表 / 审批实例 / 同步请求 / 记录）</div>
          <ChevronDown className={'w-4 h-4 transition ' + (advOpen ? 'rotate-180' : '')} />
        </Button>
        {advOpen && (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 pt-1 text-sm">
            <div className="space-y-1">
              <Label>模块</Label>
              <Select value={module} onValueChange={setModule}>
                <SelectTrigger className="h-9"><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部模块</SelectItem>
                  {MODULE_OPTIONS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>动作（按当前 Tab）</Label>
              <Select value={action} onValueChange={setAction}>
                <SelectTrigger className="h-9"><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">全部动作</SelectItem>
                  {ACTION_OPTIONS[tab].map(a => <SelectItem key={a.value} value={a.value}>{a.label} ({a.value})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>数据表</Label>
              <Select value={tableId} onValueChange={setTableId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="">全部表</SelectItem>
                  {tables.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.label} ({t.name})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>记录 ID</Label>
              <Input className="h-9" placeholder="recordId" value={recordId} onChange={e => setRecordId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>审批实例</Label>
              <Input className="h-9" placeholder="approvalInstanceId" value={approvalInstanceId} onChange={e => setApprovalInstanceId(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>同步请求</Label>
              <Input className="h-9" placeholder="syncRequestId" value={syncRequestId} onChange={e => setSyncRequestId(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v: any) => { setTab(v); setPage(1) }}>
        <TabsList className="grid grid-cols-5 h-11">
          {TABS.map(t => (
            <TabsTrigger key={t.key} value={t.key} title={t.hint} className="data-[state=active]:font-semibold">
              <t.icon className="w-4 h-4 mr-2" />{t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(t => (
          <TabsContent key={t.key} value={t.key}>
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-600">
                    <t.icon className="w-4 h-4 inline mr-2" />{t.hint}
                  </CardTitle>
                  <span className="text-xs text-slate-500">第 {page} / {totalPages} 页 · 共 {total} 条</span>
                </div>
              </CardHeader>
              <CardContent>
                <LogTable rows={rows} loading={loading} onOpen={(r) => setDetailOpen(r)} />
                <div className="flex items-center justify-between pt-4">
                  <div className="text-xs text-slate-500">{loading ? '加载中…' : `当前 ${rows.length} 条`}</div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                      <ChevronLeft className="w-4 h-4" />上一页
                    </Button>
                    <span className="text-sm px-3">{page} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                      下一页<ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!detailOpen} onOpenChange={(o: any) => !o && setDetailOpen(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-600" />审计日志详情 · #{detailOpen?.id}
              <Badge variant="outline" className="ml-2">{detailOpen?.module}</Badge>
              <Badge className="ml-1">{detailOpen?.action}</Badge>
            </DialogTitle>
          </DialogHeader>
          {detailOpen && <LogDetail row={detailOpen} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function LogTable({ rows, loading, onOpen }: { rows: LogRow[]; loading: boolean; onOpen: (r: LogRow) => void }) {
  return (
    <div className="border rounded-lg overflow-auto max-h-[60vh]">
      <Table>
        <TableHeader className="sticky top-0 bg-slate-50/90 backdrop-blur z-10">
          <TableRow>
            <TableHead className="w-16 text-center">#</TableHead>
            <TableHead>操作时间</TableHead>
            <TableHead>操作人</TableHead>
            <TableHead>模块 / 动作</TableHead>
            <TableHead>关联对象</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>IP</TableHead>
            <TableHead className="w-24">详情</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-10">加载中…</TableCell></TableRow>}
          {!loading && !rows.length && <TableRow><TableCell colSpan={8} className="text-center text-slate-500 py-10">暂无记录</TableCell></TableRow>}
          {!loading && rows.map((r) => (
            <TableRow key={r.id} className="align-top">
              <TableCell className="text-center text-slate-400 text-xs">{r.id}</TableCell>
              <TableCell className="whitespace-nowrap"><Clock className="w-3 h-3 inline mr-1 text-slate-400" />{formatDateTime(r.createdAt)}</TableCell>
              <TableCell>{r.user ? <span><b>{r.user.realName}</b> <span className="text-slate-400 text-xs ml-1">@{r.user.username}</span></span> : <span className="text-slate-400">—</span>}</TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <Badge variant="outline">{r.module}</Badge>
                  <div className="text-xs text-slate-600">{r.action}</div>
                </div>
              </TableCell>
              <TableCell className="text-xs space-y-0.5">
                {r.table && <div>表: <b>{r.table.label}</b> ({r.table.name})</div>}
                {r.recordId != null && <div>记录 ID: <b>{r.recordId}</b></div>}
                {r.approvalInstance && <div>审批 #{r.approvalInstance.id} {badgeFor(r.approvalInstance.status)}</div>}
                {r.syncRequest && <div>同步 #{r.syncRequest.id} {badgeFor(r.syncRequest.status)}</div>}
                {r.snapshotId != null && <div>快照 #{r.snapshotId}</div>}
              </TableCell>
              <TableCell>{r.approvalInstance ? badgeFor(r.approvalInstance.status) : r.syncRequest ? badgeFor(r.syncRequest.status) : (r.detail?.result ? badgeFor(r.detail.result) : null)}</TableCell>
              <TableCell className="text-xs text-slate-500 font-mono">{r.ipAddress ?? '—'}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onClick={() => onOpen(r)}><Eye className="w-3 h-3 mr-1" />查看</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function LogDetail({ row }: { row: LogRow }) {
  const [timelineRows, setTimelineRows] = useState<LogRow[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (row.tableId == null || row.recordId == null) { setTimelineRows([]); return }
    ;(async () => {
      setTimelineLoading(true)
      try {
        const p = new URLSearchParams({ tableId: String(row.tableId), recordId: String(row.recordId), pageSize: '100' })
        const r = await fetch(`/api/audit-logs?${p}`)
        const d = await r.json()
        if (!cancelled && r.ok && d.ok) setTimelineRows(d.data ?? [])
      } catch (_) {} finally { if (!cancelled) setTimelineLoading(false) }
    })()
    return () => { cancelled = true }
  }, [row.tableId, row.recordId])

  // 计算当前 row 在时间轴中的索引（高亮当前这步）
  const currentIdx = timelineRows.findIndex(r => r.id === row.id)

  return (
    <div className="grid grid-cols-3 gap-4 flex-1 min-h-0 overflow-auto pr-1">
      <div className="col-span-1 space-y-3 text-sm">
        <Card><CardHeader className="py-2"><CardTitle className="text-sm">基础信息</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-500">日志 ID</span><span>{row.id}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">模块</span><Badge variant="outline">{row.module}</Badge></div>
            <div className="flex justify-between"><span className="text-slate-500">动作</span><span className="font-medium">{row.action}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">时间</span><span>{formatDateTime(row.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">操作人</span><span>{row.user ? `${row.user.realName} @${row.user.username}` : '—'}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">IP</span><span className="font-mono">{row.ipAddress ?? '—'}</span></div>
          </CardContent>
        </Card>
        <Card><CardHeader className="py-2"><CardTitle className="text-sm">关联对象</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-xs">
            {row.table ? <div className="flex justify-between"><span className="text-slate-500">数据表</span><span>{row.table.label} <span className="text-slate-400">({row.table.name})</span></span></div> : null}
            {row.recordId != null ? <div className="flex justify-between"><span className="text-slate-500">记录 ID</span><span>{row.recordId}</span></div> : null}
            {row.snapshotId != null ? <div className="flex justify-between"><span className="text-slate-500">快照 ID</span><span>#{row.snapshotId}</span></div> : null}
            {row.approvalInstanceId ? <div className="flex justify-between"><span className="text-slate-500">审批实例</span><span>#{row.approvalInstanceId} {badgeFor(row.approvalInstance?.status)}</span></div> : null}
            {row.syncRequestId ? <div className="flex justify-between"><span className="text-slate-500">同步请求</span><span>#{row.syncRequestId} {badgeFor(row.syncRequest?.status)}</span></div> : null}
          </CardContent>
        </Card>
        <Card><CardHeader className="py-2"><CardTitle className="text-sm">User-Agent</CardTitle></CardHeader>
          <CardContent className="text-xs break-all text-slate-600">{row.userAgent ?? '—'}</CardContent>
        </Card>
        <Card><CardHeader className="py-2"><CardTitle className="text-sm">detail (JSON)</CardTitle></CardHeader>
          <CardContent className="max-h-48 overflow-auto"><pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(row.detail ?? null, null, 2)}</pre></CardContent>
        </Card>
      </div>
      <div className="col-span-2 space-y-3">
        {row.snapshot ? (
          <DiffPanel title={`差异回放 · 快照 #${row.snapshot.id}（${row.snapshot.changeType ?? '变更'}）`} before={row.snapshot.beforeData} after={row.snapshot.afterData} />
        ) : (
          <Card><CardHeader className="py-2"><CardTitle className="text-sm">差异回放</CardTitle></CardHeader>
            <CardContent className="text-sm text-slate-500 py-10 text-center">该操作未关联数据快照。</CardContent>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Card><CardHeader className="py-2"><CardTitle className="text-sm">关联审批</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {row.approvalInstanceId ? <>#{row.approvalInstanceId} {badgeFor(row.approvalInstance?.status)}</> : <span className="text-slate-400">—</span>}
            </CardContent>
          </Card>
          <Card><CardHeader className="py-2"><CardTitle className="text-sm">关联同步请求</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {row.syncRequestId ? <>#{row.syncRequestId} {badgeFor(row.syncRequest?.status)} <div className="text-xs text-slate-500 mt-1">来源: {row.syncRequest?.source ?? '—'}</div></> : <span className="text-slate-400">—</span>}
            </CardContent>
          </Card>
        </div>

        {/* 操作链路时间轴：同表 + 同 recordId 的所有审计日志，由新 → 旧 */}
        <Card>
          <CardHeader className="py-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                <Clock className="w-4 h-4 inline mr-2 text-indigo-600" />
                操作链路
                {row.table && row.recordId != null ? <span className="text-slate-400 font-normal text-xs ml-2">· {row.table.label} / 记录 #{row.recordId} · 共 {timelineRows.length} 步</span> : null}
              </CardTitle>
              {currentIdx >= 0 ? <Badge variant="outline" className="text-xs">当前是第 {timelineRows.length - currentIdx} 步</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="max-h-[40vh] overflow-auto">
            {row.tableId == null || row.recordId == null ? (
              <div className="text-sm text-slate-500 text-center py-10">该操作未关联具体记录。</div>
            ) : timelineLoading ? (
              <div className="text-sm text-slate-500 text-center py-10">加载链路中…</div>
            ) : timelineRows.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-10">无其他链路记录。</div>
            ) : (
              <ol className="relative border-l border-slate-200 ml-2 space-y-4 py-1">
                {timelineRows.map((r, i) => {
                  const step = timelineRows.length - i  // 1-based: 最新为第 1 步
                  const isCur = r.id === row.id
                  return (
                    <li key={r.id} className={'ml-5 ' + (isCur ? 'opacity-100' : 'opacity-80')}>
                      <span className={'absolute -left-[7px] flex items-center justify-center w-3.5 h-3.5 rounded-full border-2 ' + (isCur ? 'bg-indigo-600 border-indigo-600 ring-4 ring-indigo-100' : 'bg-white border-slate-300')} />
                      <div className={'border rounded-lg p-3 ' + (isCur ? 'bg-indigo-50/60 border-indigo-200' : 'bg-white')}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">第 {step} 步</Badge>
                            <Badge variant="outline" className="text-xs">{r.module}</Badge>
                            <span className="text-xs font-medium">{r.action}</span>
                            {isCur && <Badge className="bg-indigo-600 text-white text-xs">当前操作</Badge>}
                          </div>
                          <div className="text-xs text-slate-500">{formatDateTime(r.createdAt)}</div>
                        </div>
                        <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                          <span>操作人: <b>{r.user?.realName ?? '—'}</b>{r.user?.username ? <span className="text-slate-400 ml-0.5">@{r.user.username}</span> : null}</span>
                          {r.snapshotId != null && <span>快照 #{r.snapshotId}</span>}
                          {r.approvalInstanceId && <span>审批 #{r.approvalInstanceId} {badgeFor(r.approvalInstance?.status)}</span>}
                          {r.syncRequestId && <span>同步 #{r.syncRequestId} {badgeFor(r.syncRequest?.status)}</span>}
                        </div>
                        {r.snapshot && (() => {
                          const changes = snapshotChangedCount(r.snapshot)
                          return changes ? <div className="mt-1.5 text-[11px] text-slate-500">本次差异 {changes} 个字段</div> : null
                        })()}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function snapshotChangedCount(snap: { beforeData: any; afterData: any }) {
  try {
    const keys = new Set<string>()
    const walk = (o: any) => { if (!o || typeof o !== 'object') return; for (const k of Object.keys(o)) { keys.add(k); walk(o[k]) } }
    walk(snap.beforeData); walk(snap.afterData)
    let c = 0
    for (const k of keys) if (JSON.stringify(snap.beforeData?.[k]) !== JSON.stringify(snap.afterData?.[k])) c++
    return c
  } catch { return 0 }
}

function DiffPanel({ title, before, after }: { title: string; before: any; after: any }) {
  const keys = useMemo(() => {
    const s = new Set<string>()
    const walk = (o: any) => {
      if (!o || typeof o !== 'object') return
      for (const k of Object.keys(o)) { s.add(k); walk(o[k]) }
    }
    walk(before); walk(after); return Array.from(s)
  }, [before, after])

  const rows = keys.map(k => {
    const b = JSON.stringify(before?.[k])
    const a = JSON.stringify(after?.[k])
    return { key: k, before: b, after: a, eq: b === a }
  })
  const changes = rows.filter(r => !r.eq)

  return (
    <Card>
      <CardHeader className="py-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          <div className="flex gap-2 items-center">
            <Badge variant="outline">字段 {keys.length}</Badge>
            <Badge variant={changes.length ? 'destructive' : 'success'}>{changes.length ? `差异 ${changes.length}` : '无差异'}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="max-h-[50vh] overflow-auto p-0">
        <Table>
          <TableHeader className="sticky top-0 bg-slate-50/95 backdrop-blur z-10">
            <TableRow>
              <TableHead className="w-56">字段</TableHead>
              <TableHead>修改前（before）</TableHead>
              <TableHead>修改后（after）</TableHead>
              <TableHead className="w-16 text-center">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.key} className={r.eq ? '' : 'bg-rose-50/60'}>
                <TableCell className="font-mono text-xs align-top">{r.key}</TableCell>
                <TableCell className="align-top text-xs"><pre className="whitespace-pre-wrap break-words">{r.before ?? <span className="text-slate-400">（空）</span>}</pre></TableCell>
                <TableCell className="align-top text-xs"><pre className="whitespace-pre-wrap break-words">{r.after ?? <span className="text-slate-400">（空）</span>}</pre></TableCell>
                <TableCell className="text-center align-top">
                  {r.eq ? <Badge variant="outline" className="text-xs">未变</Badge> : <Badge variant="destructive" className="text-xs">修改</Badge>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
