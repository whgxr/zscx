'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Plus, Trash2, MoveUp, MoveDown, FileText, Table as TableIcon, List, Heading1,
  Heading2, Heading3, Heading4, Spline, Image, SplitSquareHorizontal, ListOrdered,
  Save, Eye, Download, Printer, Settings, X, ChevronDown,
} from 'lucide-react'
import type { DocxBlock } from '@/lib/docx-renderer'

interface Block extends DocxBlock {
  collapsed?: boolean
}

const DEFAULT_BLOCKS: Omit<Block, 'id'>[] = [
  { type: 'heading', level: 1, text: '征收补偿协议（模板）', style: { align: 'center', fontSize: 22, bold: true, spacingAfter: 12 } },
  { type: 'paragraph', text: '甲方：{{govDept|default:"某某区人民政府"}}', style: { fontSize: 12, spacingAfter: 6 } },
  { type: 'paragraph', text: '乙方（被征收人）：{{ownerName}}（身份证：{{idCard}}）', style: { fontSize: 12, spacingAfter: 6 } },
  { type: 'paragraph', text: '房屋坐落：{{address}}，面积：{{area|num:2}} 平方米', style: { fontSize: 12, spacingAfter: 6 } },
  { type: 'paragraph', text: '补偿总金额（大写）：{{totalAmount|currencyCN}}（¥{{totalAmount|num:2}}）', style: { fontSize: 12, bold: true, spacingAfter: 12, borderBottom: true } },
  {
    type: 'table',
    columns: [
      { key: 'name', label: '项目', width: 80 },
      { key: 'desc', label: '明细', width: 200 },
      { key: 'amount', label: '金额（元）', align: 'right', width: 100 },
    ],
    rowEachArrayPath: 'compensationItems',
    eachItemAlias: 'item',
    rowTemplate: ['{{item.name}}', '{{item.desc}}', '{{item.amount|num:2}}'],
    tableStyle: { headerBg: 'ECEFF1' },
  },
  { type: 'condition', conditionExpression: 'hasExtraClause == true',
    thenBlocks: [
      { id: '_t1', type: 'heading', level: 4, text: '补充条款', style: { bold: true, spacingBefore: 12 } } as any,
      { id: '_t2', type: 'richText', text: '{{{extraClause}}}', style: { fontSize: 12 } } as any,
    ],
    elseBlocks: [
      { id: '_e1', type: 'paragraph', text: '（无补充条款）', style: { fontSize: 11, color: '888888' } } as any,
    ],
  },
  { type: 'paragraph', text: '签订日期：{{signDate|date:"YYYY 年 MM 月 DD 日"}}', style: { align: 'right', spacingBefore: 24 } },
]

function uid(): string { return 'b_' + Math.random().toString(36).slice(2, 10) }

export default function WordTemplateDesignerPage() {
  const params = useParams()
  const router = useRouter()
  const id = Number(params.id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tpl, setTpl] = useState<any>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [paper, setPaper] = useState<any>({ paperSize: 'A4', orientation: 'portrait', marginsCm: { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 } })
  const [selId, setSelId] = useState<string | null>(null)
  const [previewMode, setPreviewMode] = useState<'design' | 'mock'>('design')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [mockData, setMockData] = useState<string>(JSON.stringify({
    ownerName: '张三', idCard: '110101199001010001', address: 'XX 街 12 号',
    area: 86.5, totalAmount: 1234567.89, hasExtraClause: true,
    extraClause: '本协议未尽事宜由双方协商解决。',
    signDate: '2025-06-18',
    compensationItems: [
      { name: '房屋补偿', desc: '合法面积 86.5㎡×12000', amount: 1038000 },
      { name: '装修补偿', desc: '精装', amount: 120000 },
      { name: '搬迁补助', desc: '1 户', amount: 76567.89 },
    ]
  }, null, 2))

  useEffect(() => {
    setLoading(true)
    fetch(`/api/export/templates/${id}`).then(r => r.json()).then(res => {
      if (!res.ok) throw new Error(res.error)
      const t = res.data
      setTpl(t)
      const cfg: any = t.documentConfig ?? { blocks: [] }
      setBlocks(cfg.blocks?.length ? cfg.blocks.map((b: any) => ({ ...b, id: b.id ?? uid() })) : DEFAULT_BLOCKS.map((b: any) => ({ ...b, id: uid() })))
      setPaper((p: any) => ({ ...p, ...(cfg.paper ?? {}), paperSize: t.paperSize || cfg.paper?.paperSize || p.paperSize, orientation: t.orientation || cfg.paper?.orientation || p.orientation }))
      setLoading(false)
    }).catch(e => { setPreviewError(e.message); setLoading(false) })
  }, [id])

  const selected = useMemo(() => blocks.find(b => b.id === selId) || null, [blocks, selId])

  function addBlock(type: Block['type']) {
    const blk: Block = { id: uid(), type } as Block
    if (type === 'paragraph') blk.text = '新段落。可插入 {{字段}}。'
    if (type === 'heading') { blk.level = 2; blk.text = '新标题' }
    if (type === 'richText') blk.text = '富文本 {{{htmlField}}}'
    if (type === 'list') { blk.ordered = false; blk.items = ['条目一 {{a}}', '条目二 {{b}}'] }
    if (type === 'table') {
      blk.columns = [{ key: 'c1', label: '列1' }, { key: 'c2', label: '列2' }, { key: 'c3', label: '列3' }]
      blk.rowEachArrayPath = 'rows'
      blk.eachItemAlias = 'r'
      blk.rowTemplate = ['{{r.c1}}', '{{r.c2}}', '{{r.c3}}']
    }
    if (type === 'condition') { blk.conditionExpression = 'amount > 10000'; blk.thenBlocks = []; blk.elseBlocks = [] }
    if (type === 'each') { blk.eachArrayPath = 'list'; blk.eachItemAlias = 'it'; blk.eachIndexAlias = 'i'; blk.bodyBlocks = [] }
    const nb = [...blocks, blk]
    setBlocks(nb); setSelId(blk.id)
  }

  function updateBlock(id: string, patch: Partial<Block>) {
    setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b))
  }
  function deleteBlock(id: string) {
    setBlocks(bs => bs.filter(b => b.id !== id)); if (selId === id) setSelId(null)
  }
  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks(bs => {
      const i = bs.findIndex(b => b.id === id)
      if (i < 0) return bs
      const j = i + dir
      if (j < 0 || j >= bs.length) return bs
      const a = [...bs]
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })
  }

  async function save(publish?: boolean) {
    setSaving(true)
    try {
      const docCfg = { paper, blocks }
      const res = await fetch(`/api/export/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tpl?.name, description: tpl?.description, category: tpl?.category,
          paperSize: paper.paperSize, orientation: paper.orientation, outputFormat: publish ? 'PDF' : tpl?.outputFormat,
          documentConfig: docCfg,
        })
      }).then(r => r.json())
      if (!res.ok) throw new Error(res.error)
      setPreviewError(publish ? '已保存（默认输出 PDF）' : '已保存')
      setTimeout(() => setPreviewError(null), 1800)
    } catch (e: any) { setPreviewError(e.message) } finally { setSaving(false) }
  }

  async function doGenerate(action: 'preview' | 'download' | 'printPdf') {
    if (!tpl?.table?.name) { setPreviewError('缺少表信息'); return }
    try {
      let recId = 0
      // 找一条真实数据；没有就用 mock（但仍需 recordId，用一条表内记录或新建空记录）
      const recs = await fetch(`/api/data-records?tableId=${tpl.table.id}&limit=1`).then(r => r.json())
      const rows: any[] = recs.ok ? recs.data?.rows ?? [] : []
      recId = rows[0]?.id ?? 0
      setPreviewError(null)
      const md = JSON.parse(mockData)
      if (!recId) { setPreviewError('该表暂无真实记录，生成失败。建议先新增一条记录后再预览。'); return }
      const res = await fetch(`/api/export/${tpl.table.name}/docx`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: id, recordId: recId, action, related: { surveyRecord: md } })
      }).then(r => r.json())
      if (!res.ok) throw new Error(res.error)
      const d = res.data
      // 通过 <a download> 触发
      const blob = b64toBlob(d.base64, d.mime)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = d.filename
      if (action === 'printPdf' && d.format === 'PDF') {
        // 打开 PDF 新标签可打印
        window.open(url, '_blank', 'noopener')
      } else {
        document.body.appendChild(a); a.click(); a.remove()
      }
      setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch (e: any) { setPreviewError(e.message) }
  }

  if (loading) return <div className="p-8 text-muted-foreground">加载模板中...</div>
  if (!tpl) return <div className="p-8 text-muted-foreground">模板不存在</div>

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-white border-b flex items-center gap-2 px-4 py-2">
        <FileText className="w-5 h-5 text-slate-600" />
        <Input className="w-64" defaultValue={tpl.name} onBlur={e => setTpl((p: any) => ({ ...p, name: e.target.value }))} />
        <Badge variant="outline" className="ml-2">Word 文书</Badge>
        <Badge variant="outline" className="ml-1">{tpl.table?.label} ({tpl.table?.name})</Badge>
        <div className="flex-1" />
        <Tabs value={previewMode} onValueChange={(v: any) => setPreviewMode(v)} className="w-auto"><TabsList className="h-8"><TabsTrigger value="design" className="text-xs h-7 px-3">设计</TabsTrigger><TabsTrigger value="mock" className="text-xs h-7 px-3">模拟数据</TabsTrigger></TabsList></Tabs>
        <Select value={paper.paperSize} onValueChange={v => setPaper((p: any) => ({ ...p, paperSize: v }))}><SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="A4">A4</SelectItem><SelectItem value="A5">A5</SelectItem><SelectItem value="Letter">Letter</SelectItem></SelectContent></Select>
        <Select value={paper.orientation} onValueChange={v => setPaper((p: any) => ({ ...p, orientation: v }))}><SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="portrait">纵向</SelectItem><SelectItem value="landscape">横向</SelectItem></SelectContent></Select>
        <Button variant="secondary" size="sm" onClick={() => save(false)} disabled={saving}><Save className="w-4 h-4 mr-1" />保存</Button>
        <Button variant="outline" size="sm" onClick={() => doGenerate('preview')}><Eye className="w-4 h-4 mr-1" />预览 .docx</Button>
        <Button variant="outline" size="sm" onClick={() => doGenerate('download')}><Download className="w-4 h-4 mr-1" />下载</Button>
        <Button variant="default" size="sm" onClick={() => doGenerate('printPdf')}><Printer className="w-4 h-4 mr-1" />打印 PDF</Button>
        <Button variant="ghost" size="sm" onClick={() => router.back()}><X className="w-4 h-4" /></Button>
      </div>
      {previewError && <div className="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b">{previewError}</div>}

      <div className="flex-1 flex min-h-0">
        {/* Left Palette */}
        <div className="w-56 border-r bg-white p-3 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 mb-2">插入块</div>
          <div className="grid grid-cols-2 gap-1">
            <PalBtn onClick={() => addBlock('heading')} icon={<Heading2 className="w-3.5 h-3.5" />}>标题</PalBtn>
            <PalBtn onClick={() => addBlock('paragraph')} icon={<FileText className="w-3.5 h-3.5" />}>段落</PalBtn>
            <PalBtn onClick={() => addBlock('richText')} icon={<Spline className="w-3.5 h-3.5" />}>富文本</PalBtn>
            <PalBtn onClick={() => addBlock('table')} icon={<TableIcon className="w-3.5 h-3.5" />}>表格</PalBtn>
            <PalBtn onClick={() => addBlock('list')} icon={<List className="w-3.5 h-3.5" />}>项目符号</PalBtn>
            <PalBtn onClick={() => addBlock('list')} icon={<ListOrdered className="w-3.5 h-3.5" />} onClickExtra={() => {
              // ordered list
            }}>编号列表</PalBtn>
            <PalBtn onClick={() => addBlock('condition')} icon={<SplitSquareHorizontal className="w-3.5 h-3.5" />}>条件</PalBtn>
            <PalBtn onClick={() => addBlock('each')} icon={<ChevronDown className="w-3.5 h-3.5" />}>循环</PalBtn>
            <PalBtn onClick={() => addBlock('image')} icon={<Image className="w-3.5 h-3.5" />}>图片</PalBtn>
            <PalBtn onClick={() => addBlock('pageBreak')} icon={<Settings className="w-3.5 h-3.5" />}>分页</PalBtn>
          </div>
          <Separator className="my-3" />
          <div className="text-xs font-semibold text-slate-500 mb-2">字段（点击插入到所选文本）</div>
          <div className="space-y-1 max-h-48 overflow-auto">
            {tpl.table?.fields?.length ? tpl.table.fields.map((f: any) => (
              <button key={f.id}
                onClick={() => {
                  if (!selected) return
                  const key = ['paragraph', 'heading', 'richText'].includes(selected.type) ? 'text' : null
                  if (!key) return
                  updateBlock(selected.id, { [key]: ((selected as any)[key] ?? '') + ` {{${f.name}}}` } as any)
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 text-xs border">
                <div className="font-medium">{f.label}</div>
                <div className="text-[10px] text-slate-500">{'{{' + f.name + '}}'} · {f.type}</div>
              </button>
            )) : <div className="text-xs text-slate-400">未找到字段</div>}
          </div>
          <Separator className="my-3" />
          <div className="text-xs font-semibold text-slate-500 mb-2">系统变量</div>
          <div className="space-y-1">
            {[
              { label: '行号(1起)', code: '{{@row}}' },
              { label: '索引(0起)', code: '{{@index}}' },
              { label: '是否首行', code: '{{@first}}' },
              { label: '是否末行', code: '{{@last}}' },
              { label: '父级字段', code: '{{../fieldName}}' },
            ].map(v => (
              <button key={v.code}
                onClick={() => {
                  if (!selected) return
                  const key = ['paragraph', 'heading', 'richText'].includes(selected.type) ? 'text' : null
                  if (!key) return
                  updateBlock(selected.id, { [key]: ((selected as any)[key] ?? '') + ' ' + v.code } as any)
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 text-xs border">
                <div className="font-medium">{v.label}</div>
                <div className="text-[10px] text-slate-500">{v.code}</div>
              </button>
            ))}
          </div>
          <Separator className="my-3" />
          <div className="text-xs font-semibold text-slate-500 mb-2">格式化器（点插入）</div>
          <div className="space-y-1">
            {[
              { label: '日期格式化', code: '|date:"YYYY年MM月DD日"' },
              { label: '保留小数', code: '|num:2' },
              { label: '千分位', code: '|FORMAT_NUMBER:2' },
              { label: '人民币大写', code: '|RMB' },
              { label: '大写', code: '|upper' },
              { label: '小写', code: '|lower' },
              { label: '默认值', code: '|default:"未填"' },
              { label: '去空格', code: '|trim' },
            ].map(f => (
              <button key={f.code}
                onClick={() => {
                  if (!selected) return
                  const key = ['paragraph', 'heading', 'richText'].includes(selected.type) ? 'text' : null
                  if (!key) return
                  updateBlock(selected.id, { [key]: ((selected as any)[key] ?? '') + f.code } as any)
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-slate-100 text-xs border">
                <div className="font-medium">{f.label}</div>
                <div className="text-[10px] text-slate-500">{f.code}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-400 leading-relaxed">
            用法：<code>{'{{字段名|格式化器}}'}</code>，可链式：<code>{'{{amount|num:2|RMB}}'}</code>
          </div>
        </div>

        {/* Center Canvas (A4) */}
        <Tabs value={previewMode} className="flex-1 flex flex-col min-w-0">
          <TabsContent value="design" className="mt-0 flex-1 overflow-auto p-8 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
            <A4Paper paper={paper} blocks={blocks} selId={selId} onSelect={setSelId} onMove={moveBlock} onDelete={deleteBlock} selected={selected} onUpdate={updateBlock} />
          </TabsContent>
          <TabsContent value="mock" className="mt-0 flex-1 overflow-auto p-4 min-h-0 data-[state=active]:flex data-[state=active]:flex-col">
            <Card className="flex-1 flex flex-col"><CardHeader><CardTitle className="text-sm">模拟数据（JSON）</CardTitle></CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                <Textarea className="font-mono text-xs flex-1 min-h-[400px]" value={mockData} onChange={e => setMockData(e.target.value)} />
                <div className="mt-2 text-xs text-slate-500">预览 .docx 时仍以表内真实记录为主；若表内暂无记录将报错。</div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Right Inspector */}
        <div className="w-80 border-l bg-white p-3 overflow-y-auto">
          {selected ? (
            <BlockInspector key={selected.id} block={selected} onChange={(p: any) => updateBlock(selected.id, p)} />
          ) : (
            <div className="text-xs text-slate-500">
              在画布上点击任一内容块进行属性设置。
              <Separator className="my-3" />
              <PageSettings paper={paper} onChange={setPaper} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PalBtn({ children, onClick, icon }: any) {
  return (
    <button onClick={onClick} className="inline-flex flex-col items-center gap-1 px-1 py-2 text-xs text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50">
      {icon}{children}
    </button>
  )
}

function A4Paper({ paper, blocks, selId, onSelect, onMove, onDelete, selected, onUpdate }: any) {
  const W = paper.orientation === 'landscape' ? '297mm' : '210mm'
  const H = paper.orientation === 'landscape' ? '210mm' : '297mm'
  return (
    <div className="mx-auto">
      <div style={{ width: W, minHeight: H, background: '#fff', boxShadow: '0 2px 20px rgba(0,0,0,0.08)', border: '1px solid #e5e7eb' }}
        className="relative p-6 flex flex-col gap-2">
        {blocks.length === 0 && <div className="text-xs text-slate-400 py-12 text-center">（空模板：从左侧拖入/点击内容块开始设计）</div>}
        {blocks.map((b: Block, i: number) => {
          const sel = selId === b.id
          return (
            <div key={b.id} className={'group relative rounded ' + (sel ? 'ring-2 ring-blue-500 -outline-offset-1' : 'hover:ring-1 hover:ring-slate-200')} onClick={e => { e.stopPropagation(); onSelect(b.id) }}>
              {sel && <div className="absolute -right-2 -top-2 z-10 bg-white border rounded-md shadow-sm flex items-center p-0.5 gap-0.5">
                <IconBtn onClick={(e: any) => { e.stopPropagation(); onMove(b.id, -1) }} icon={<MoveUp className="w-3 h-3" />} title="上移" />
                <IconBtn onClick={(e: any) => { e.stopPropagation(); onMove(b.id, 1) }} icon={<MoveDown className="w-3 h-3" />} title="下移" />
                <IconBtn onClick={(e: any) => { e.stopPropagation(); onDelete(b.id) }} icon={<Trash2 className="w-3 h-3 text-red-600" />} title="删除" />
              </div>}
              <BlockPreview block={b} selected={selected} onUpdate={onUpdate} idx={i} />
            </div>
          )
        })}
        <button onClick={e => { e.stopPropagation(); onSelect(null) }} className="mt-4 text-xs text-slate-400 border-t pt-2">点击取消选中</button>
      </div>
      <div className="text-xs text-center text-slate-400 mt-3 mb-8">纸张 {paper.paperSize} · {paper.orientation === 'landscape' ? '横向' : '纵向'} · A4 画布比例（实际打印以 Word/PDF 为准）</div>
    </div>
  )
}

function IconBtn({ onClick, icon, title }: any) {
  return <button title={title} onClick={onClick} className="p-1 rounded hover:bg-slate-100">{icon}</button>
}

function BlockPreview({ block, selected, onUpdate }: any) {
  const s = block.style || {}
  const commonIn = { fontSize: s.fontSize ? `${s.fontSize}px` : undefined, fontWeight: s.bold ? 700 : undefined, fontStyle: s.italic ? 'italic' : undefined, textDecoration: s.underline ? 'underline' : undefined, color: s.color ? '#' + s.color : undefined, textAlign: s.align, lineHeight: s.lineHeight, paddingLeft: s.indent?.leftCm ? s.indent.leftCm * 96 / 2.54 + 'px' : undefined, textIndent: s.indent?.firstLineCm ? s.indent.firstLineCm * 96 / 2.54 * 2 + 'px' : undefined, marginTop: s.spacingBefore ? s.spacingBefore + 'px' : undefined, marginBottom: s.spacingAfter ? s.spacingAfter + 'px' : undefined, borderBottom: s.borderBottom ? '1px solid #000' : undefined, paddingBottom: s.borderBottom ? 4 : undefined } as React.CSSProperties
  if (block.type === 'heading') {
    const lvl = block.level ?? 1; const sz = [36, 28, 22, 18, 15, 13][lvl - 1] ?? 13
    return <h1 style={{ ...commonIn, fontSize: s.fontSize ? undefined : sz, fontWeight: 700 }} className="truncate">{block.text || '(无标题)'}</h1>
  }
  if (block.type === 'paragraph' || block.type === 'richText') {
    return <p style={{ ...commonIn, whiteSpace: 'pre-wrap' }} className="text-sm leading-6">{block.text || '(空段落)'}</p>
  }
  if (block.type === 'pageBreak') return <div className="border-dashed border-2 border-slate-300 text-center text-xs text-slate-400 py-2">—— 分页符 ——</div>
  if (block.type === 'table') {
    return (
      <table className="w-full border-collapse border text-xs my-2">
        <thead><tr className="bg-slate-100">
          {block.columns?.map((c: any, i: number) => <th key={i} className="border border-slate-300 px-2 py-1 text-left">{c.label}{c.key ? <span className="text-slate-400 ml-1">[{'{{' + c.key + '}}'}]</span> : null}</th>)}
        </tr></thead>
        <tbody>
          {block.rows && block.rows.length
            ? block.rows.map((r: any, i: number) => <tr key={i}>{r.cells.map((c: any, j: number) => <td key={j} className="border border-slate-300 px-2 py-1">{c || '—'}</td>)}</tr>)
            : <tr><td colSpan={block.columns?.length || 1} className="border border-slate-300 px-2 py-1 text-slate-400">数据源 = #{block.rowEachArrayPath || '未设置循环数组'}</td></tr>}
        </tbody>
      </table>
    )
  }
  if (block.type === 'list') {
    const items = block.items || []
    return <ol className="list-decimal ml-6 text-sm" style={{ ...commonIn }}>{items.map((t: string, i: number) => <li key={i}>{t}</li>)}</ol>
  }
  if (block.type === 'condition') {
    return <div className="border-l-4 border-amber-400 pl-3 py-1 text-sm">
      <div className="text-xs text-amber-700 mb-1">IF {block.conditionExpression || '(未填)'}</div>
      <div className="rounded border border-amber-200 p-2 text-xs text-slate-600 mb-1">THEN 块 ({block.thenBlocks?.length ?? 0}) — 可在右侧属性中编辑子块 JSON</div>
      {block.elseBlocks?.length ? <div className="rounded border border-slate-200 p-2 text-xs text-slate-600">ELSE 块 ({block.elseBlocks.length})</div> : null}
    </div>
  }
  if (block.type === 'each') {
    return <div className="border-l-4 border-indigo-400 pl-3 py-1 text-sm">
      <div className="text-xs text-indigo-700 mb-1">EACH {block.eachArrayPath || '(未填)'} AS {block.eachItemAlias || 'item'}</div>
      <div className="rounded border border-indigo-200 p-2 text-xs text-slate-600">BODY 块 ({block.bodyBlocks?.length ?? 0}) — 在右侧属性中编辑子块 JSON</div>
    </div>
  }
  if (block.type === 'image') return <div className="my-2 px-3 py-6 text-center border border-dashed text-xs text-slate-400">图片：{block.imageFieldPath || '(未设置字段)'}</div>
  return null
}

function BlockInspector({ block, onChange }: any) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold flex items-center gap-2 text-slate-500"><Badge variant="outline">{block.type}</Badge>id: <code className="text-slate-500">{block.id}</code></div>
      {['paragraph','heading','richText'].includes(block.type) && (
        <div className="space-y-2">
          <Label>内容文本</Label>
          <Textarea rows={5} value={block.text ?? ''} onChange={e => onChange({ text: e.target.value })} className="font-mono text-xs" />
          {block.type === 'heading' && (
            <div className="flex gap-2 items-center"><Label className="w-16">层级</Label>
              <Select value={String(block.level || 1)} onValueChange={v => onChange({ level: Number(v) as 1 })}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>{[1,2,3,4,5,6].map(i => <SelectItem key={i} value={String(i)}>H{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <TextStylePanel value={block.style || {}} onChange={(s: any) => onChange({ style: s })} />
        </div>
      )}

      {block.type === 'table' && (
        <div className="space-y-2">
          <Label>表格列（JSON）</Label>
          <JsonEditor value={block.columns || []} onChange={(v: any) => onChange({ columns: v })} />
          <Label className="mt-2 block">循环数组字段</Label>
          <Input value={block.rowEachArrayPath || ''} onChange={e => onChange({ rowEachArrayPath: e.target.value })} placeholder="如 compensationItems" />
          <Label>行别名</Label>
          <Input value={block.eachItemAlias || 'item'} onChange={e => onChange({ eachItemAlias: e.target.value })} />
          <Label>行模板（与列同顺序，逗号分隔的模板字符串数组 JSON）</Label>
          <Textarea rows={3} value={JSON.stringify(block.rowTemplate ?? [], null, 2)} className="font-mono text-xs"
            onChange={e => { try { onChange({ rowTemplate: JSON.parse(e.target.value) }) } catch { /* */ } }} />
          <Label>表头色</Label>
          <Input value={block.tableStyle?.headerBg || 'ECEFF1'} onChange={e => onChange({ tableStyle: { ...block.tableStyle, headerBg: e.target.value } })} />
        </div>
      )}

      {block.type === 'list' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2"><Switch checked={!!block.ordered} onCheckedChange={v => onChange({ ordered: v })} /><Label>有序列表</Label></div>
          <Label>循环数组字段（留空则用静态 items）</Label>
          <Input value={block.listEachArrayPath || ''} onChange={e => onChange({ listEachArrayPath: e.target.value })} />
          <Label>items（JSON 数组）</Label>
          <JsonEditor value={block.items || []} onChange={(v: any) => onChange({ items: v })} />
          {block.listEachArrayPath && (<><Label>行别名</Label><Input value={block.eachItemAlias || 'item'} onChange={e => onChange({ eachItemAlias: e.target.value })} /><Label>条目模板</Label><Input value={block.listItemTemplate || ''} onChange={e => onChange({ listItemTemplate: e.target.value })} placeholder="- {{item.title}}" /></>)}
          <TextStylePanel value={block.style || {}} onChange={(s: any) => onChange({ style: s })} />
        </div>
      )}

      {block.type === 'condition' && (
        <div className="space-y-2">
          <Label>条件表达式</Label>
          <Input value={block.conditionExpression || ''} onChange={e => onChange({ conditionExpression: e.target.value })} placeholder='amount > 1000 && hasExtra == true' />
          <div className="text-[11px] text-slate-500">语法：字段名 {'≥ / ≤ / == / != / > / <'}，支持 {'&& / || / !()'}。</div>
          <Label>THEN 子块（JSON blocks[]）</Label>
          <JsonEditor value={block.thenBlocks || []} onChange={(v: any) => onChange({ thenBlocks: v })} />
          <Label>ELSE 子块（JSON blocks[]）</Label>
          <JsonEditor value={block.elseBlocks || []} onChange={(v: any) => onChange({ elseBlocks: v })} />
        </div>
      )}

      {block.type === 'each' && (
        <div className="space-y-2">
          <Label>数组字段</Label><Input value={block.eachArrayPath || ''} onChange={e => onChange({ eachArrayPath: e.target.value })} />
          <Label>别名 / 索引变量</Label>
          <div className="flex gap-2"><Input value={block.eachItemAlias || 'item'} onChange={e => onChange({ eachItemAlias: e.target.value })} /><Input value={block.eachIndexAlias || 'i'} onChange={e => onChange({ eachIndexAlias: e.target.value })} /></div>
          <Label>BODY 子块（JSON blocks[]）</Label>
          <JsonEditor value={block.bodyBlocks || []} onChange={(v: any) => onChange({ bodyBlocks: v })} />
        </div>
      )}

      {block.type === 'image' && (
        <div className="space-y-2"><Label>图片字段（base64 或 URL）</Label><Input value={block.imageFieldPath || ''} onChange={e => onChange({ imageFieldPath: e.target.value })} />
          <div className="flex gap-2"><Label className="w-14">宽 cm</Label><Input type="number" value={block.imageDefaultWidthCm || ''} onChange={e => onChange({ imageDefaultWidthCm: Number(e.target.value) })} /><Label className="w-14">高 cm</Label><Input type="number" value={block.imageDefaultHeightCm || ''} onChange={e => onChange({ imageDefaultHeightCm: Number(e.target.value) })} /></div>
        </div>
      )}
    </div>
  )
}

function TextStylePanel({ value, onChange }: any) {
  const s = value || {}
  const upd = (p: string, v: any) => onChange({ ...s, [p]: v })
  return (
    <div className="space-y-2 border rounded-md p-2">
      <div className="flex items-center gap-1">
        <TBtn active={s.bold} onClick={() => upd('bold', !s.bold)}><Bold className="w-3.5 h-3.5" /></TBtn>
        <TBtn active={s.italic} onClick={() => upd('italic', !s.italic)}><Italic className="w-3.5 h-3.5" /></TBtn>
        <TBtn active={s.underline} onClick={() => upd('underline', !s.underline)}><Underline className="w-3.5 h-3.5" /></TBtn>
        <div className="w-px h-5 bg-slate-200 mx-1" />
        <TBtn active={s.align === 'left'} onClick={() => upd('align', 'left')}><AlignLeft className="w-3.5 h-3.5" /></TBtn>
        <TBtn active={s.align === 'center'} onClick={() => upd('align', 'center')}><AlignCenter className="w-3.5 h-3.5" /></TBtn>
        <TBtn active={s.align === 'right'} onClick={() => upd('align', 'right')}><AlignRight className="w-3.5 h-3.5" /></TBtn>
        <TBtn active={s.align === 'justify'} onClick={() => upd('align', 'justify')}><AlignJustify className="w-3.5 h-3.5" /></TBtn>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Label className="text-[11px]">字号 pt</Label><Input className="h-8 text-xs" value={s.fontSize || ''} onChange={e => upd('fontSize', Number(e.target.value) || undefined)} />
        <Label className="text-[11px]">颜色 HEX</Label><Input className="h-8 text-xs" value={s.color || ''} onChange={e => upd('color', e.target.value)} />
        <Label className="text-[11px]">段前</Label><Input className="h-8 text-xs" value={s.spacingBefore || ''} onChange={e => upd('spacingBefore', Number(e.target.value) || undefined)} />
        <Label className="text-[11px]">段后</Label><Input className="h-8 text-xs" value={s.spacingAfter || ''} onChange={e => upd('spacingAfter', Number(e.target.value) || undefined)} />
        <Label className="text-[11px]">行高</Label><Input className="h-8 text-xs" value={s.lineHeight || ''} onChange={e => upd('lineHeight', Number(e.target.value) || undefined)} />
        <Label className="text-[11px] col-span-2 flex items-center gap-2"><Switch checked={!!s.borderBottom} onCheckedChange={v => upd('borderBottom', v)} /><span className="text-[11px] text-slate-600">段落下划线</span></Label>
      </div>
    </div>
  )
}

function TBtn({ children, active, onClick }: any) {
  return <button onClick={onClick} className={'p-1.5 rounded hover:bg-slate-100 ' + (active ? 'bg-slate-200 text-slate-900' : 'text-slate-600')}>{children}</button>
}

function JsonEditor({ value, onChange }: any) {
  const [txt, setTxt] = useState<string>(() => JSON.stringify(value ?? [], null, 2))
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { setTxt(JSON.stringify(value ?? [], null, 2)); setErr(null) }, [value])
  return (
    <div>
      <Textarea rows={6} value={txt} className="font-mono text-xs" onChange={e => {
        setTxt(e.target.value)
        try { const v = JSON.parse(e.target.value); onChange(v); setErr(null) } catch (er: any) { setErr(er.message) }
      }} />
      {err ? <div className="text-[11px] text-red-600 mt-1">JSON 错误：{err}</div> : null}
    </div>
  )
}

function PageSettings({ paper, onChange }: any) {
  const p = paper || {}
  const m = p.marginsCm || {}
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-500 mb-1">纸张设置</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Label>上 cm</Label><Input className="h-8" value={m.top ?? 2.54} onChange={e => onChange({ ...p, marginsCm: { ...m, top: Number(e.target.value) } })} />
        <Label>下 cm</Label><Input className="h-8" value={m.bottom ?? 2.54} onChange={e => onChange({ ...p, marginsCm: { ...m, bottom: Number(e.target.value) } })} />
        <Label>左 cm</Label><Input className="h-8" value={m.left ?? 3.17} onChange={e => onChange({ ...p, marginsCm: { ...m, left: Number(e.target.value) } })} />
        <Label>右 cm</Label><Input className="h-8" value={m.right ?? 3.17} onChange={e => onChange({ ...p, marginsCm: { ...m, right: Number(e.target.value) } })} />
      </div>
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
