'use client'
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, FileText, FileSpreadsheet, Settings, Pencil, Trash2, Printer, FileCode } from 'lucide-react'
import Link from 'next/link'

export default function ExportTemplatesListPage() {
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [tables, setTables] = useState<any[]>([])
  const [filterType, setFilterType] = useState<string>('ALL')
  const [filterTable, setFilterTable] = useState<string>('ALL')
  const [kw, setKw] = useState('')

  async function load() {
    const [r1, r2] = await Promise.all([
      fetch('/api/export/templates').then(r => r.json()),
      fetch('/api/tables').then(r => r.json()),
    ])
    if (r1.ok) setRows(r1.data)
    if (r2.ok) setTables(r2.data)
  }

  useEffect(() => { load() }, [])

  async function createNew(type: 'WORD' | 'FORM') {
    if (filterTable === 'ALL') { alert('请先选择目标数据表'); return }
    const res = await fetch('/api/export/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableId: Number(filterTable), type })
    }).then(r => r.json())
    if (!res.ok) return alert(res.error)
    if (type === 'WORD') router.push(`/dashboard/word-templates/${res.data.id}`)
    else router.push(`/dashboard/export-templates/${res.data.id}`)
  }

  async function del(id: number) {
    if (!confirm('确认删除？')) return
    const r = await fetch(`/api/export/templates/${id}`, { method: 'DELETE' }).then(r => r.json())
    if (r.ok) load()
  }

  const data = rows
    .filter(r => filterType === 'ALL' || r.type === filterType)
    .filter(r => filterTable === 'ALL' || r.tableId === Number(filterTable) || r.isShared)
    .filter(r => !kw || (r.name + (r.description ?? '')).toLowerCase().includes(kw.toLowerCase()))

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileCode className="w-5 h-5" />文书与导出模板管理</CardTitle>
          <CardDescription>Word 文书模板（征收协议、公告等）、Excel 导出模板的统一管理</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 items-end mb-4">
            <div className="w-48"><Label>类型</Label>
              <Select value={filterType} onValueChange={setFilterType}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部</SelectItem>
                  <SelectItem value="WORD">Word 文书</SelectItem>
                  <SelectItem value="FORM">Excel 表单</SelectItem>
                  <SelectItem value="STANDARD">Excel 列表</SelectItem>
                  <SelectItem value="CARD">卡片</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-64"><Label>所属数据表</Label>
              <Select value={filterTable} onValueChange={setFilterTable}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">全部表</SelectItem>
                  {tables.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.label} ({t.name})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-72"><Label>搜索</Label><Input value={kw} onChange={e => setKw(e.target.value)} placeholder="模板名称 / 描述" /></div>
            <div className="flex-1" />
            <Button variant="default" onClick={() => createNew('WORD')}><Plus className="w-4 h-4 mr-1" />新建 Word 模板</Button>
            <Button variant="outline" onClick={() => createNew('FORM')}><Plus className="w-4 h-4 mr-1" />新建 Excel 模板</Button>
            <Button variant="ghost" asChild><Link href="/dashboard/export-templates"><Settings className="w-4 h-4 mr-1" />Excel 编辑器</Link></Button>
          </div>

          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left font-medium px-3 py-2">名称</th>
                  <th className="text-left font-medium px-3 py-2 w-20">类型</th>
                  <th className="text-left font-medium px-3 py-2 w-28">分类</th>
                  <th className="text-left font-medium px-3 py-2">数据表</th>
                  <th className="text-left font-medium px-3 py-2 w-20">纸张/格式</th>
                  <th className="text-left font-medium px-3 py-2 w-24">更新</th>
                  <th className="text-left font-medium px-3 py-2 w-36">操作</th>
                </tr>
              </thead>
              <tbody>
                {data.map(r => <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2"><div className="font-medium">{r.name}{r.isDefault ? <Badge className="ml-2" variant="secondary">默认</Badge> : null}{r.isSystem ? <Badge className="ml-2" variant="outline">系统</Badge> : null}{r.isShared ? <Badge className="ml-2" variant="outline">共享</Badge> : null}</div>
                    {r.description ? <div className="text-xs text-slate-500">{r.description}</div> : null}</td>
                  <td className="px-3 py-2"><Badge variant="outline">{r.type}</Badge></td>
                  <td className="px-3 py-2 text-xs text-slate-600">{r.category}</td>
                  <td className="px-3 py-2">{r.table?.label ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.type === 'WORD' ? <span>{r.paperSize || 'A4'} / {r.orientation === 'landscape' ? '横' : '纵'}</span> : <span>—</span>}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{r.updatedAt?.slice(0,10)}</td>
                  <td className="px-3 py-2 flex gap-1">
                    <Button size="sm" variant="ghost" asChild><Link href={r.type === 'WORD' ? `/dashboard/word-templates/${r.id}` : `/dashboard/export-templates/${r.id}`}><Pencil className="w-3.5 h-3.5" /></Link></Button>
                    <Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5 text-red-600" /></Button>
                  </td>
                </tr>)}
                {data.length === 0 ? <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400 text-xs">暂无模板</td></tr> : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
