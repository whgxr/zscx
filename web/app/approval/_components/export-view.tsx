'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, RefreshCw, FileSpreadsheet, FileText, Printer } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

type ExportItem = {
  id: number
  action: string
  actionLabel: string
  table: { id: number; label: string; name: string } | null
  fileName: string | null
  recordCount: number | null
  format: string | null
  createdAt: string
}

const ACTION_ICON: Record<string, any> = {
  EXPORT_EXCEL: FileSpreadsheet,
  EXPORT_PDF: FileText,
  DOC_DOWNLOAD: FileText,
  DOC_PREVIEW: FileText,
  DOC_PRINT: Printer,
}

const ACTION_BADGE: Record<string, string> = {
  EXPORT_EXCEL: 'bg-emerald-100 text-emerald-700',
  EXPORT_PDF: 'bg-rose-100 text-rose-700',
  DOC_DOWNLOAD: 'bg-sky-100 text-sky-700',
  DOC_PREVIEW: 'bg-slate-100 text-slate-600',
  DOC_PRINT: 'bg-amber-100 text-amber-700',
}

export function ExportView() {
  const [rows, setRows] = useState<ExportItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
      const res = await fetch(`/api/export-tasks?${q.toString()}`)
      const json = await res.json()
      if (json.ok) { setRows(json.data ?? []); setTotal(json.total ?? 0) }
      else alert(json.error)
    } finally { setLoading(false) }
  }, [page, pageSize])

  useEffect(() => { load() }, [load])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">我的导出</h2>
          <p className="text-sm text-slate-500 mt-0.5">我执行过的 Excel / PDF / 文书导出历史。共 {total} 条。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 mr-2" />刷新</Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>数据表</TableHead>
              <TableHead>文件</TableHead>
              <TableHead>记录数</TableHead>
              <TableHead>时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-10">加载中…</TableCell></TableRow>}
            {!loading && rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-10">暂无导出记录</TableCell></TableRow>}
            {rows.map((item) => {
              const Icon = ACTION_ICON[item.action] ?? FileText
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <Badge variant="outline" className={ACTION_BADGE[item.action] ?? ''}>{item.actionLabel}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{item.table?.label ?? '—'}</TableCell>
                  <TableCell className="text-xs text-slate-600 max-w-xs truncate">{item.fileName ?? '—'}</TableCell>
                  <TableCell className="text-sm text-slate-600">{item.recordCount != null ? item.recordCount : '—'}</TableCell>
                  <TableCell className="text-xs text-slate-500">{formatDateTime(item.createdAt)}</TableCell>
                </TableRow>
              )
            })}
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
    </div>
  )
}
