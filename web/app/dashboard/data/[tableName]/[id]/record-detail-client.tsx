"use client"

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DynamicForm } from '@/components/dynamic-form'
import { ArrowLeft, Edit, Save, X, History, UserCheck, Send, RefreshCw, Printer, FileDown, FileText, FileSpreadsheet, ClipboardList, Scale } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { useTabs, resolveKeyFromHref } from '@/components/layout/tabs-context'
import { SnapshotHistoryDialog } from '@/components/snapshot-history-dialog'
import { SpecialRequestDialog } from '@/components/approval/special-request-dialog'
import { DataTable, TableField, DataRecord, RecordStatus } from '@prisma/client'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const statusMap: Record<RecordStatus, { label: string; variant: string }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  SUBMITTED: { label: '已提交', variant: 'default' },
  REVIEWED: { label: '已审核', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  ARCHIVED: { label: '已归档', variant: 'outline' },
  // v1.2.2+ 征收模块状态
  PENDING_APPROVAL: { label: '待审批', variant: 'warning' },
  CHANGED: { label: '已变更', variant: 'default' },
}

const INSTANCE_STATUS_COLOR: Record<string, string> = {
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

const NODE_COLOR: Record<string, string> = {
  PENDING: 'border-slate-300 bg-slate-100 text-slate-600',
  APPROVING: 'border-yellow-400 bg-yellow-50 text-yellow-700',
  COUNTERSIGNING: 'border-yellow-400 bg-yellow-50 text-yellow-700',
  PROCESSED: 'border-emerald-400 bg-emerald-50 text-emerald-700',
}

function actionLabel(a: string | null | undefined) {
  switch (a) {
    case 'APPROVED': return { txt: '通过', cls: 'text-emerald-600' }
    case 'REJECTED': return { txt: '驳回', cls: 'text-rose-600' }
    case 'REVOKED': return { txt: '撤回', cls: 'text-slate-600' }
    case 'TRANSFERRED': return { txt: '转签', cls: 'text-sky-600' }
    case 'ADD_COUNTERSIGN': return { txt: '加签', cls: 'text-indigo-600' }
    case 'RESTART': return { txt: '驳回重提', cls: 'text-orange-600' }
    case 'GOTO_NODE': return { txt: '回退节点', cls: 'text-orange-600' }
    case 'TIMEOUT_PASS': return { txt: '超时自通', cls: 'text-emerald-600' }
    case 'TIMEOUT_REJECT': return { txt: '超时驳回', cls: 'text-rose-600' }
    case 'CC_NOTIFIED': return { txt: '抄送', cls: 'text-slate-500' }
    default: return { txt: a ?? '待处理', cls: 'text-slate-500' }
  }
}

interface RecordDetailClientProps {
  table: DataTable & {
    fields: TableField[]
    formLayoutConfig?: any
  }
  record: DataRecord & {
    creator?: {
      id: number
      realName: string | null
      username: string
    } | null
  }
  initialEditMode?: boolean
  module?: string
  userRole?: string
}

export function RecordDetailClient({ table, record, initialEditMode = false, module: moduleProp = '', userRole = '' }: RecordDetailClientProps) {
  // v1.2.3+ 门禁二级：管理员/超管可绕过"先上传图片"锁定，直接编辑全部字段
  const isAdminRole = userRole === 'ADMIN' || userRole === 'MANAGER'
  const router = useRouter()
  const currentModule = moduleProp || ''
  const moduleQuery = currentModule ? `?module=${currentModule}` : ''
  const { prepareLabel } = useTabs()
  // 注册标签标题：表名 · 记录#id
  useEffect(() => {
    prepareLabel(
      resolveKeyFromHref(window.location.href),
      `${table.label} · 记录#${record.id}`
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [isEditing, setIsEditing] = useState(initialEditMode)
  const [formData, setFormData] = useState<Record<string, any>>(record.data as any || {})
  const [loading, setLoading] = useState(false)

  // 审批时间线
  const [approvalsLoading, setApprovalsLoading] = useState(false)
  const [instances, setInstances] = useState<any[]>([])
  const loadApprovals = async () => {
    setApprovalsLoading(true)
    try {
      const r = await fetch(`/api/approval/v2/instances?scope=all&recordId=${record.id}&pageSize=200`)
      const j = await r.json()
      if (j.ok) setInstances(j.data ?? [])
    } finally { setApprovalsLoading(false) }
  }
  useEffect(() => { loadApprovals() }, [record.id])

  // 专项审批发起弹窗（从当前记录发起，锁定目标记录，无需再选）
  const [approvalOpen, setApprovalOpen] = useState(false)

  // 数据快照 / 变更历史
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false)

  const statusInfo = statusMap[record.status as RecordStatus]

  // ============ M3-T6 生成文书 ============
  const [docDlgOpen, setDocDlgOpen] = useState(false)
  const [docTemplates, setDocTemplates] = useState<any[]>([])
  const [selDocTpl, setSelDocTpl] = useState<number | ''>('')
  const [docAction, setDocAction] = useState<'preview' | 'download' | 'printPdf'>('preview')
  const [docLoading, setDocLoading] = useState(false)
  const [docMsg, setDocMsg] = useState<string | null>(null)
  async function loadDocTemplates() {
    const r = await fetch(`/api/export/templates?tableId=${table.id}`).then(r => r.json())
    if (r.ok) setDocTemplates(r.data ?? [])
  }
  useMemo(() => { if (docDlgOpen) loadDocTemplates() }, [docDlgOpen, table.id])
  const wordTpls = docTemplates.filter(t => t.type === 'WORD')
  const excelTpls = docTemplates.filter(t => t.type !== 'WORD')

  async function generateDoc() {
    if (!selDocTpl) { alert('请选择模板'); return }
    const tpl = docTemplates.find(t => t.id === selDocTpl)
    if (!tpl) return
    setDocLoading(true); setDocMsg(null)
    try {
      if (tpl.type === 'WORD') {
        const res = await fetch(`/api/export/${table.name}/docx`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId: tpl.id, recordId: record.id, action: docAction })
        }).then(r => r.json())
        if (!res.ok) throw new Error(res.error)
        const d = res.data
        const blob = b64toBlob(d.base64, d.mime)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = d.filename
        if (docAction === 'printPdf' && d.format === 'PDF') window.open(url, '_blank', 'noopener')
        else { document.body.appendChild(a); a.click(); a.remove() }
        setTimeout(() => URL.revokeObjectURL(url), 15000)
        setDocMsg(`生成成功（${d.format}，${d.renderMs}ms）`)
      } else {
        // Excel 路径：沿用现有 /api/export/[tableName]
        const url = `/api/export/${table.name}?templateId=${tpl.id}&recordId=${record.id}&format=${docAction === 'printPdf' ? 'pdf' : 'xlsx'}`
        window.open(url, '_blank', 'noopener')
        setDocMsg('已在新窗口打开导出')
      }
    } catch (e: any) { setDocMsg('失败：' + e.message) } finally { setDocLoading(false) }
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/data/${table.name}/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData }),
      })

      if (res.ok) {
        setIsEditing(false)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push(`/dashboard/data/${table.name}${moduleQuery}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">记录详情 #{record.id}</h1>
              <Badge variant={statusInfo?.variant as any}>{statusInfo?.label}</Badge>
              {currentModule === 'survey' && (
                <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
                  <ClipboardList className="w-3 h-3 mr-1" /> 调查中
                </Badge>
              )}
              {currentModule === 'levy' && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
                  <Scale className="w-3 h-3 mr-1" /> 征收中
                </Badge>
              )}
            </div>
            <p className="text-gray-500 mt-1">
              {table.label} · 创建于 {formatDateTime(record.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setSnapshotDialogOpen(true)} title="查看该记录的数据快照/变更历史">
            <History className="w-4 h-4 mr-2" />
            变更历史
          </Button>
          <Button variant="outline" onClick={() => setDocDlgOpen(true)} title="生成 Word/Excel 文书并预览、下载、打印">
            <FileText className="w-4 h-4 mr-2" />
            生成文书
          </Button>
          <Button
            variant="secondary"
            onClick={() => setApprovalOpen(true)}
            title="发起专项动作审批（已锁定当前记录）"
          >
            <Send className="w-4 h-4 mr-2" />
            发起审批
          </Button>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-2" />
                取消
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="w-4 h-4 mr-2" />
              编辑
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isEditing ? '编辑信息' : '详细信息'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DynamicForm
            fields={table.fields}
            values={formData}
            onChange={setFormData}
            disabled={!isEditing}
            layoutConfig={table.formLayoutConfig}
            module={currentModule === 'survey' ? 'survey' : currentModule === 'levy' ? 'levy' : 'both'}
            ignoreGateLock={isAdminRole}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">记录信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">创建人</p>
              <p className="font-medium mt-1">
                {record.creator?.realName || record.creator?.username || '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">创建时间</p>
              <p className="font-medium mt-1">{formatDateTime(record.createdAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">更新时间</p>
              <p className="font-medium mt-1">{formatDateTime(record.updatedAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">所属表</p>
              <p className="font-medium mt-1">{table.label}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ============ M2-T7 审批时间线 ============ */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <CardTitle className="text-lg">审批记录（{instances.length} 次）</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={loadApprovals} disabled={approvalsLoading}>
            <RefreshCw className={'w-4 h-4 mr-2 ' + (approvalsLoading ? 'animate-spin' : '')} />刷新
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {approvalsLoading && <div className="text-sm text-slate-500">加载审批时间线…</div>}
          {!approvalsLoading && instances.length === 0 && (
            <div className="text-sm text-slate-500 flex items-center gap-2 py-8 justify-center border border-dashed rounded-lg">
              <UserCheck className="w-5 h-5 text-slate-400" /> 暂无审批记录。点击右上角「提交审批」发起该记录的审批流程。
            </div>
          )}
          {instances.map(inst => (
            <div key={inst.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30">
              <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{inst.workflow.name}</span>
                    <Badge variant="outline" className="!font-mono text-xs">#{inst.id}</Badge>
                    <Badge variant="outline" className={INSTANCE_STATUS_COLOR[inst.status] ?? ''}>{inst.status}</Badge>
                    {inst.triggerEvent && <Badge variant="outline" className="text-xs">{inst.triggerEvent}</Badge>}
                    <span className="text-xs text-slate-500">v{inst.workflow.version ?? 1}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    发起人：{inst.initiator?.realName || inst.initiator?.username || '-'}
                    · 发起时间：{formatDateTime(inst.startedAt)}
                    {inst.completedAt ? ' · 完成：' + formatDateTime(inst.completedAt) : ''}
                  </div>
                </div>
              </div>

              {inst.nodeInstances?.length > 0 && (
                <ol className="relative border-l border-slate-200 pl-6 space-y-5 ml-2">
                  {inst.nodeInstances.map((n: any) => {
                    const nodeDone = !!n.processedAt || n.action
                    const a = actionLabel(n.action)
                    const cls = nodeDone ? NODE_COLOR.PROCESSED : NODE_COLOR[n.status] ?? NODE_COLOR.PENDING
                    return (
                      <li key={n.id} className="relative">
                        <span
                          className={`absolute -left-[29px] mt-1.5 w-4 h-4 rounded-full border-2 ${cls}`}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{n.node.nodeName || n.node.nodeType}</span>
                          <Badge variant="outline" className="text-xs">{n.node.nodeType}</Badge>
                          {n.assignee && (
                            <span className="text-xs text-slate-600">
                              处理人：<b>{n.assignee.realName || n.assignee.username}</b>
                            </span>
                          )}
                          {n.countersignTotal != null && (
                            <span className="text-xs text-slate-600">
                              会签进度 <b>{n.countersignApprovedCount ?? 0}/{n.countersignTotal}</b>
                            </span>
                          )}
                        </div>
                        {nodeDone ? (
                          <div className="text-sm mt-1">
                            <span className={`font-medium ${a.cls}`}>{a.txt}</span>
                            <span className="mx-2 text-slate-300">·</span>
                            <span className="text-xs text-slate-500">{formatDateTime(n.processedAt ?? n.createdAt)}</span>
                            {n.comment && (
                              <div className="mt-1 p-2 bg-white border border-slate-200 rounded-md text-sm text-slate-700 whitespace-pre-wrap">
                                💬 {n.comment}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 mt-1">等待处理…</div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              )}

              {inst.approvalChain && Array.isArray(inst.approvalChain) && inst.approvalChain.length > 0 && !inst.nodeInstances?.length && (
                <ol className="relative border-l border-slate-200 pl-6 space-y-5 ml-2">
                  {inst.approvalChain.map((item: any, i: number) => (
                    <li key={i} className="relative">
                      <span className={`absolute -left-[29px] mt-1.5 w-4 h-4 rounded-full border-2 ${NODE_COLOR.PROCESSED}`} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{item.nodeName ?? `节点 ${item.nodeId}`}</span>
                        {item.action && <span className={`text-sm font-medium ${actionLabel(item.action).cls}`}>{actionLabel(item.action).txt}</span>}
                        <span className="text-xs text-slate-500">{formatDateTime(item.at ?? inst.startedAt)}</span>
                      </div>
                      {item.comment && (
                        <div className="mt-1 p-2 bg-white border border-slate-200 rounded-md text-sm text-slate-700 whitespace-pre-wrap">
                          💬 {item.comment}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ============ M3-T6 生成文书对话框 ============ */}
      <Dialog open={docDlgOpen} onOpenChange={setDocDlgOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="w-4 h-4" />生成文书 / 导出</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="grid flex-1 min-w-[260px] gap-1.5">
                <Label>数据表</Label>
                <div className="text-sm text-slate-600 border rounded-md px-3 py-2 bg-slate-50">{table.label} <span className="text-slate-400">({table.name})</span> · 记录 #{record.id}</div>
              </div>
              <div className="grid flex-1 min-w-[200px] gap-1.5">
                <Label>输出动作</Label>
                <Select value={docAction} onValueChange={(v: any) => setDocAction(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preview">预览 .docx/.xlsx</SelectItem>
                    <SelectItem value="download">下载文件</SelectItem>
                    <SelectItem value="printPdf">打印 PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs defaultValue="word">
              <TabsList>
                <TabsTrigger value="word">Word 文书（{wordTpls.length}）</TabsTrigger>
                <TabsTrigger value="excel">Excel 模板（{excelTpls.length}）</TabsTrigger>
              </TabsList>
              <TabsContent value="word">
                <div className="space-y-2 mt-2 min-h-[200px]">
                  <Select value={selDocTpl ? (wordTpls.find(t => t.id === selDocTpl) ? String(selDocTpl) : '') : ''}
                    onValueChange={v => setSelDocTpl(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="请选择 Word 文书模板" /></SelectTrigger>
                    <SelectContent>
                      {wordTpls.map(t => <SelectItem key={t.id} value={String(t.id)}>
                        <span className="flex items-center gap-2"><b>{t.name}</b>{t.isDefault ? <Badge variant="secondary">默认</Badge> : null}{t.isShared ? <Badge variant="outline">共享</Badge> : null}
                          <span className="text-slate-400 text-xs ml-1">{t.paperSize || 'A4'}/{t.orientation === 'landscape' ? '横' : '纵'} · {t.category}</span>
                        </span>
                      </SelectItem>)}
                      {!wordTpls.length && <SelectItem disabled value="_">（尚未配置 Word 模板）</SelectItem>}
                    </SelectContent>
                  </Select>
                  {selDocTpl && (() => {
                    const t = wordTpls.find(x => x.id === selDocTpl)
                    return t ? <div className="text-xs text-slate-500 border rounded-md p-3 bg-slate-50">
                      <div className="font-medium text-slate-700 mb-1">{t.name}</div>
                      {t.description ? <div className="mb-1">{t.description}</div> : null}
                      <div className="text-[11px]">输出格式优先：{t.outputFormat || 'DOCX'} · 更新：{t.updatedAt?.slice(0, 10)}</div>
                    </div> : null
                  })()}
                </div>
              </TabsContent>
              <TabsContent value="excel">
                <div className="space-y-2 mt-2 min-h-[200px]">
                  <Select value={selDocTpl ? (excelTpls.find(t => t.id === selDocTpl) ? String(selDocTpl) : '') : ''}
                    onValueChange={v => setSelDocTpl(Number(v))}>
                    <SelectTrigger><SelectValue placeholder="请选择 Excel 导出模板" /></SelectTrigger>
                    <SelectContent>
                      {excelTpls.map(t => <SelectItem key={t.id} value={String(t.id)}>
                        <span className="flex items-center gap-2"><Badge variant="outline">{t.type}</Badge><b>{t.name}</b>{t.isDefault ? <Badge variant="secondary">默认</Badge> : null}<span className="text-slate-400 text-xs ml-1">{t.category}</span></span>
                      </SelectItem>)}
                      {!excelTpls.length && <SelectItem disabled value="_">（尚未配置 Excel 模板）</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>
            </Tabs>

            {docMsg && <div className={'text-xs px-3 py-2 rounded-md border ' + (docMsg.startsWith('失败') ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')}>{docMsg}</div>}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="ghost" onClick={() => setDocDlgOpen(false)}>取消</Button>
              <Button onClick={generateDoc} disabled={docLoading || !selDocTpl}>
                {docLoading ? '生成中…' : (docAction === 'printPdf' ? '打印 PDF' : docAction === 'download' ? '下载文件' : '预览生成')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SnapshotHistoryDialog
        open={snapshotDialogOpen}
        onOpenChange={setSnapshotDialogOpen}
        tableName={table.name}
        recordId={record.id}
        tableLabel={table.label}
      />

      <SpecialRequestDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        tableId={table.id}
        tableLabel={table.label}
        defaultRecordId={record.id}
        defaultRecordData={record.data as any}
        onDone={loadApprovals}
      />
    </div>
  )
}

function b64toBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const buf = new ArrayBuffer(bin.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i)
  return new Blob([buf], { type: mime })
}
