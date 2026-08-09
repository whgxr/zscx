"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft, Send, XCircle, Share2, Clock, FolderKanban, ClipboardCheck,
  FileSignature, FileText, User, Loader2, Check,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { formatDateTime } from '@/lib/utils'

type Tab = 'todo' | 'mine'

interface TodoItem {
  nodeId: number
  instanceId: number
  workflowName?: string | null
  table: { id: number; name: string; label: string }
  record: { id: number; data?: any; status: string }
  initiator?: { realName?: string | null; username?: string | null } | null
  startedAt: string | Date
  dueAt?: string | Date | null
  countersignTotal?: number | null
  countersignApprovedCount?: number | null
}

interface ChainStep {
  assignee?: { realName?: string | null; username?: string | null } | null
  status: string
  action?: string | null
  processedAt?: string | Date | null
  comment?: string | null
}

interface MineItem {
  instanceId: number
  workflowName?: string | null
  status: string
  table: { id: number; name: string; label: string }
  record: { id: number; data?: any; status: string }
  startedAt: string | Date
  completedAt?: string | Date | null
  chain: ChainStep[]
}

export function H5ApprovalClient({ userId, todo, mine }: { userId: number; todo: TodoItem[]; mine: MineItem[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('todo')
  const [acting, setActing] = useState<number | null>(null)

  const handleAction = async (t: TodoItem, action: 'APPROVE' | 'REJECT' | 'TRANSFER', comment = '', transferTo?: number) => {
    setActing(t.nodeId)
    try {
      const res = await fetch('/api/approval/nodes/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeInstanceId: t.nodeId,
          action,
          comment,
          transferTo,
        }),
      })
      const data = await res.json()
      if (res.ok) { alert(action === 'APPROVE' ? '已通过' : action === 'REJECT' ? '已驳回' : '已转办'); location.reload() }
      else alert(data.message || '操作失败')
    } catch { alert('操作失败') } finally { setActing(null) }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* 顶部 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/projects')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">审批中心</h1>
            <p className="text-xs text-gray-500">待办 {todo.length} 条 · 我发起 {mine.length} 条</p>
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full grid grid-cols-2 h-10">
            <TabsTrigger value="todo" className="text-sm">
              <ClipboardCheck className="w-4 h-4 mr-1" /> 待办 ({todo.length})
            </TabsTrigger>
            <TabsTrigger value="mine" className="text-sm">
              <FolderKanban className="w-4 h-4 mr-1" /> 我发起 ({mine.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 px-4 py-3">
        {tab === 'todo' && (
          <div className="space-y-3">
            {todo.length === 0 && <Empty icon={<ClipboardCheck className="w-12 h-12 text-gray-200" />} text="暂无待办审批，辛苦了 🎉" />}
            {todo.map((t) => (
              <TodoCard key={t.nodeId} t={t} acting={acting === t.nodeId} onAction={handleAction} userId={userId} router={router} />
            ))}
          </div>
        )}
        {tab === 'mine' && (
          <div className="space-y-3">
            {mine.length === 0 && <Empty icon={<FolderKanban className="w-12 h-12 text-gray-200" />} text="暂无我发起的审批" />}
            {mine.map((m) => (
              <MineCard key={m.instanceId} m={m} router={router} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="text-center py-20">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="text-gray-500">{text}</p>
    </div>
  )
}

function TodoCard({
  t, acting, onAction, userId, router,
}: { t: TodoItem; acting: boolean; onAction: (t: TodoItem, action: 'APPROVE' | 'REJECT' | 'TRANSFER', comment?: string, transferTo?: number) => void; userId: number; router: any }) {
  const [expand, setExpand] = useState(false)
  const [comment, setComment] = useState('')

  return (
    <Card className="shadow-sm border-0">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <Badge variant="outline" className="text-[10px] font-mono">#{t.instanceId}</Badge>
          <Badge className="text-[10px] bg-amber-500">待处理</Badge>
        </div>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-base font-semibold text-gray-900 line-clamp-1">
            {t.table.label} · #{t.record.id}
          </h3>
        </div>
        {t.workflowName && (
          <p className="text-xs text-gray-400 mb-2">流程：{t.workflowName}</p>
        )}
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <User className="w-3 h-3" />
          <span>发起人：{t.initiator?.realName || t.initiator?.username || '-'}</span>
          <span className="mx-1">·</span>
          <Clock className="w-3 h-3" />
          <span>{formatDateTime(t.startedAt)}</span>
        </div>
        {(t.countersignTotal ?? 0) > 1 && (
          <div className="text-xs text-indigo-600 mb-2 bg-indigo-50 rounded-lg px-2 py-1 border border-indigo-100">
            会签进度：{t.countersignApprovedCount ?? 0} / {t.countersignTotal}
          </div>
        )}

        <div className="flex gap-2 items-center mt-3">
          <Button
            size="sm" variant="outline"
            className="flex-1 h-9 rounded-lg"
            onClick={() => router.push(`/h5/projects/${t.table.name}/${t.record.id}`)}
          >
            <FileText className="w-4 h-4 mr-1" /> 查看记录
          </Button>
          <Button
            size="sm"
            className="flex-1 h-9 rounded-lg"
            onClick={() => setExpand(v => !v)}
            disabled={acting}
          >
            {acting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />处理中</> : <>操作 ▾</>}
          </Button>
        </div>

        {expand && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
            <div>
              <Label className="text-xs text-gray-500">审批意见</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="请输入审批意见（可选）"
                className="mt-1 text-sm rounded-lg resize-none"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                className="h-9 rounded-lg bg-green-600 hover:bg-green-700"
                onClick={() => onAction(t, 'APPROVE', comment)}
                disabled={acting}
              >
                <Check className="w-4 h-4 mr-1" /> 通过
              </Button>
              <Button
                size="sm" variant="destructive"
                className="h-9 rounded-lg"
                onClick={() => onAction(t, 'REJECT', comment)}
                disabled={acting}
              >
                <XCircle className="w-4 h-4 mr-1" /> 驳回
              </Button>
              <Button
                size="sm" variant="outline"
                className="h-9 rounded-lg"
                onClick={() => {
                  const target = prompt('请输入转办目标用户的 userId（数字）')
                  if (!target) return
                  const n = parseInt(target)
                  if (isNaN(n)) { alert('请输入正确的 userId'); return }
                  onAction(t, 'TRANSFER', comment, n)
                }}
                disabled={acting}
              >
                <Share2 className="w-4 h-4 mr-1" /> 转办
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function statusBadge(s: string) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: '待启动', cls: 'bg-gray-100 text-gray-600' },
    IN_PROGRESS: { label: '审批中', cls: 'bg-blue-100 text-blue-600' },
    APPROVED: { label: '已通过', cls: 'bg-green-100 text-green-600' },
    REJECTED: { label: '已驳回', cls: 'bg-red-100 text-red-600' },
    CANCELLED: { label: '已取消', cls: 'bg-amber-100 text-amber-700' },
    RESTARTED: { label: '已重提', cls: 'bg-indigo-100 text-indigo-600' },
  }
  const m = map[s] || { label: s, cls: 'bg-gray-100 text-gray-600' }
  return <Badge className={'text-[10px] ' + m.cls}>{m.label}</Badge>
}

function MineCard({ m, router }: { m: MineItem; router: any }) {
  return (
    <Card className="shadow-sm border-0">
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-mono">#{m.instanceId}</Badge>
            {statusBadge(m.status)}
          </div>
          <span className="text-[10px] text-gray-400">{formatDateTime(m.startedAt)}</span>
        </div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">
          {m.table.label} · #{m.record.id}
        </h3>
        {m.workflowName && <p className="text-xs text-gray-400 mb-2">流程：{m.workflowName}</p>}

        {/* 链 */}
        <ol className="relative border-l border-gray-200 ml-2 pl-4 space-y-2 my-3">
          {m.chain.map((c, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[19px] top-1 w-3 h-3 rounded-full bg-white border-2 border-gray-300"></span>
              <div className="text-xs">
                <div className="flex items-center gap-1">
                  <User className="w-3 h-3 text-gray-400" />
                  <span className="text-gray-700 font-medium">
                    {c.assignee?.realName || c.assignee?.username || '-'}
                  </span>
                  <Badge className="text-[9px] scale-90 origin-left">{c.status}</Badge>
                  {c.action && <Badge variant={c.action === 'APPROVED' ? 'default' : 'destructive'} className="text-[9px] scale-90 origin-left">{c.action}</Badge>}
                </div>
                <div className="text-gray-400 mt-0.5">
                  {c.processedAt ? formatDateTime(c.processedAt) : '未处理'}
                </div>
                {c.comment && <div className="text-gray-600 mt-0.5 bg-gray-50 rounded p-1.5 border border-gray-100">{c.comment}</div>}
              </div>
            </li>
          ))}
        </ol>

        <div className="flex gap-2 mt-2">
          <Button
            size="sm" variant="outline" className="flex-1 h-8 rounded-lg"
            onClick={() => router.push(`/h5/projects/${m.table.name}/${m.record.id}`)}
          >
            <FileText className="w-4 h-4 mr-1" /> 查看记录
          </Button>
        </div>
      </div>
    </Card>
  )
}
