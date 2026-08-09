"use client"

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table2, Building2, FileText, ChevronRight, Search,
  LayoutDashboard, Users, FolderOpen, TrendingUp, ClipboardList, FileCheck, Scale
} from 'lucide-react'

interface TableMeta {
  id: number; name: string; label: string; icon: string | null; description: string | null;
  categoryId: number | null; categoryName: string | null; categoryModule: string | null;
}

interface ProjectsClientProps {
  user: any
  tables: TableMeta[]
  recordCounts: Record<number, number>
  statusCounts: Record<number, { draft: number; approving: number; passed: number }>
  isAdmin: boolean
}

type ModuleKey = 'ALL' | 'SURVEY' | 'LEVY'

const iconMap: Record<string, React.ReactNode> = {
  home: <LayoutDashboard className="w-6 h-6" />,
  table: <Table2 className="w-6 h-6" />,
  users: <Users className="w-6 h-6" />,
  building: <Building2 className="w-6 h-6" />,
  file: <FileText className="w-6 h-6" />,
}

function belongsTo(mod: ModuleKey, t: TableMeta): boolean {
  if (mod === 'ALL') return true
  const m = t.categoryModule
  if (m === 'BOTH') return true
  return m === mod
}

export function ProjectsClient({ user, tables, recordCounts, statusCounts, isAdmin }: ProjectsClientProps) {
  const router = useRouter()
  const [mod, setMod] = useState<ModuleKey>('ALL')
  const [q, setQ] = useState('')

  const totalRecords = Object.values(recordCounts).reduce((s, n) => s + n, 0)
  const totalDraft = Object.values(statusCounts).reduce((s, x) => s + x.draft, 0)
  const totalApproving = Object.values(statusCounts).reduce((s, x) => s + x.approving, 0)

  const visibleTables = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return tables.filter(t => {
      if (!belongsTo(mod, t)) return false
      if (!kw) return true
      return (t.label ?? '').toLowerCase().includes(kw)
        || (t.name ?? '').toLowerCase().includes(kw)
        || (t.description ?? '').toLowerCase().includes(kw)
        || (t.categoryName ?? '').toLowerCase().includes(kw)
    })
  }, [tables, mod, q])

  // 按 category 分组
  const grouped = useMemo(() => {
    const g: Record<string, { id: number | null; name: string; items: TableMeta[] }> = {}
    for (const t of visibleTables) {
      const key = t.categoryId ? `cat_${t.categoryId}` : 'cat_null'
      if (!g[key]) g[key] = { id: t.categoryId, name: t.categoryName ?? '未分类', items: [] }
      g[key].items.push(t)
    }
    return Object.values(g)
  }, [visibleTables])

  return (
    <div className="px-4 pt-4 pb-24">
      {/* 头部 */}
      <div className="bg-primary rounded-2xl p-5 mb-4 text-white shadow">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm opacity-80">欢迎回来</p>
            <h1 className="text-xl font-bold mt-0.5">{user.realName || user.username}</h1>
          </div>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
            <span className="text-lg font-bold">
              {(user.realName || user.username).charAt(0)}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          <Stat label="项目总数" value={tables.length} icon={<FolderOpen className="w-4 h-4" />} />
          <Stat label="记录总数" value={totalRecords} icon={<ClipboardList className="w-4 h-4" />} highlight />
          <Stat label="审批中" value={totalApproving} icon={<Scale className="w-4 h-4" />} />
        </div>
        {(totalDraft > 0 || totalApproving > 0) && (
          <div className="mt-3 bg-white/10 rounded-lg p-2 text-xs flex items-center gap-2">
            <FileCheck className="w-4 h-4 shrink-0" />
            <span>您有 <b>{totalDraft}</b> 份草稿、<b>{totalApproving}</b> 份审批中记录，点击可进入项目列表处理。</span>
          </div>
        )}
      </div>

      {/* 搜索框 */}
      <div className="mb-3 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索项目名称、表名、分类、描述..."
          className="h-10 pl-9 rounded-xl bg-white shadow-sm border-gray-100 text-sm"
        />
      </div>

      <Tabs value={mod} onValueChange={(v: any) => setMod(v)}>
        <TabsList className="w-full grid grid-cols-3 mb-3 h-10">
          <TabsTrigger value="ALL" className="text-sm"><FolderOpen className="w-4 h-4 mr-1" />全部</TabsTrigger>
          <TabsTrigger value="SURVEY" className="text-sm"><ClipboardList className="w-4 h-4 mr-1" />调查</TabsTrigger>
          <TabsTrigger value="LEVY" className="text-sm"><Scale className="w-4 h-4 mr-1" />征收</TabsTrigger>
        </TabsList>
        <TabsContent value={mod as any}>
          {!visibleTables.length ? (
            <div className="text-center py-16">
              <FolderOpen className="w-16 h-16 mx-auto text-gray-200 mb-3" />
              <p className="text-gray-500">当前模块下暂无可用项目</p>
              <p className="text-gray-400 text-sm mt-1">联系管理员分配权限</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(g => (
                <div key={g.id ?? 'null'}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="text-sm font-semibold text-slate-700">{g.name}</h3>
                    <span className="text-xs text-slate-400">{g.items.length} 个</span>
                  </div>
                  <div className="space-y-3">
                    {g.items.map(t => {
                      const total = recordCounts[t.id] || 0
                      const sc = statusCounts[t.id] ?? { draft: 0, approving: 0, passed: 0 }
                      return (
                        <Card
                          key={t.id}
                          className="border shadow-sm cursor-pointer active:scale-[0.98] transition-transform rounded-xl"
                          onClick={() => router.push(`/h5/projects/${t.name}`)}
                        >
                          <CardContent className="p-3.5 flex items-center gap-3">
                            <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                              {t.icon && iconMap[t.icon] ? iconMap[t.icon] : <Table2 className="w-6 h-6 text-primary" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="font-medium text-gray-900 truncate">{t.label}</h3>
                                <div className="flex items-center gap-1 shrink-0">
                                  {sc.draft > 0 && <Badge variant="secondary" className="text-xs h-5 px-1.5">草稿 {sc.draft}</Badge>}
                                  {sc.approving > 0 && <Badge className="text-xs h-5 px-1.5 bg-yellow-500">审批 {sc.approving}</Badge>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge variant="outline" className="text-xs h-5">共 {total} 条</Badge>
                                {t.categoryModule && (
                                  <Badge variant={t.categoryModule === 'LEVY' ? 'default' : 'success' as any} className="text-xs h-5 px-1.5">
                                    {t.categoryModule === 'SURVEY' ? '调查' : t.categoryModule === 'LEVY' ? '征收' : '调查+征收'}
                                  </Badge>
                                )}
                                {t.description && <span className="text-xs text-gray-400 truncate">{t.description}</span>}
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Stat({ label, value, icon, highlight }: { label: string; value: number; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={'rounded-xl p-3 ' + (highlight ? 'bg-white/20' : 'bg-white/10')}>
      <div className="flex items-center gap-1 opacity-90 mb-1 text-xs">{icon}{label}</div>
      <div className="text-xl font-bold leading-tight">{value}</div>
    </div>
  )
}
