"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, ArrowLeft, Download, Printer, Save } from 'lucide-react'
import UniverDocsEditor, { UniverDocsEditorHandle } from '@/components/univer/univer-docs-editor'
import { richContentToUniverDocData, univerDocDataToRichContent } from '@/lib/univer-docs-adapter'
import { useTabs, resolveKeyFromHref } from '@/components/layout/tabs-context'

export interface WordTemplateProps {
  id: number
  name: string
  description?: string | null
  tableName: string
  tableLabel?: string
  fields: Array<{ name: string; label: string; type?: string }>
  documentConfig?: any
  paperSize?: string
  orientation?: string
}

export function UniverWordDesigner({ template }: { template: WordTemplateProps }) {
  const router = useRouter()
  const { prepareLabel } = useTabs()
  const editorRef = useRef<UniverDocsEditorHandle>(null)
  const [status, setStatus] = useState<'ok' | 'err'>('ok')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  const fields = template.fields

  useEffect(() => {
    prepareLabel(resolveKeyFromHref(window.location.href), `Word：${template.name}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id])

  /** 初始 IDocumentData：由存量的 RichContent 转换而来 */
  const initialDocData = useMemo(() => {
    const cfg = template.documentConfig ?? {}
    const content = cfg.content ?? cfg.blockless
    if (!content) return undefined
    return richContentToUniverDocData(content)
  }, [template.documentConfig])

  function currentRichContent() {
    const snap = editorRef.current?.getSnapshot()
    if (!snap) return null
    return univerDocDataToRichContent(snap)
  }

  async function save(publish = false) {
    setSaving(true)
    try {
      const rich = currentRichContent()
      if (!rich) { setMsg('Univer 尚未就绪，无法保存'); return }
      const res = await fetch(`/api/export/templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          category: 'PRINT',
          paperSize: template.paperSize,
          orientation: template.orientation,
          outputFormat: publish ? 'PDF' : undefined,
          documentConfig: { content: rich, paper: { paperSize: template.paperSize, orientation: template.orientation } },
        }),
      }).then((r) => r.json())
      if (!res.ok) throw new Error(res.error)
      setMsg(publish ? '已保存（默认输出 PDF）' : '已保存')
      setTimeout(() => setMsg(''), 1500)
    } catch (e: any) {
      setMsg('保存失败：' + (e.message || ''))
    } finally {
      setSaving(false)
    }
  }

  async function doGenerate(action: 'download' | 'printPdf') {
    if (!template.tableName) { setMsg('缺少表信息，无法生成'); return }
    try { await save(false) } catch { /* 继续 */ }
    try {
      const recs = await fetch(`/api/data/${template.tableName}?page=1&pageSize=1`).then((r) => r.json())
      const rows = recs.ok ? recs.data?.rows ?? [] : (recs.records ?? [])
      const recId = rows[0]?.id ?? recs.records?.[0]?.id ?? 0
      setMsg('')
      if (!recId) { setMsg('该表暂无真实记录，请先新增记录'); return }
      const res = await fetch(`/api/export/${template.tableName}/docx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, recordId: recId, action }),
      }).then((r) => r.json())
      if (!res.ok) throw new Error(res.error)
      const d = res.data
      const blob = b64toBlob(d.base64, d.mime)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = d.filename
      if (action === 'printPdf' && d.format === 'PDF') window.open(url, '_blank', 'noopener')
      else { document.body.appendChild(a); a.click(); a.remove() }
      setTimeout(() => URL.revokeObjectURL(url), 15000)
    } catch (e: any) {
      setMsg('生成失败：' + (e.message || ''))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/word-templates')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> 返回
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Word 文书设计器（Univer Docs）</h1>
            <p className="text-gray-500 text-sm">
              {template.tableLabel || '文书'} · <span className="font-mono">{template.name}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => doGenerate('download')}>
            <Download className="w-4 h-4 mr-2" /> 生成 .docx
          </Button>
          <Button variant="outline" onClick={() => doGenerate('printPdf')}>
            <Printer className="w-4 h-4 mr-2" /> 打印 PDF
          </Button>
          <Button onClick={() => save(false)} disabled={saving}>
            <Save className="w-4 h-4 mr-2" /> {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {msg && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded bg-amber-50 text-amber-800 border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5" /> {msg}
        </div>
      )}

      <Card>
        <CardContent className="p-3 flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline" className="text-xs">Univer Docs 编辑器</Badge>
          <Badge variant="outline" className="text-xs">{fields.length} 个可用字段</Badge>
          <span className="text-xs text-muted-foreground">纸张 {template.paperSize || 'A4'} · {template.orientation === 'landscape' ? '横向' : '纵向'}</span>
          <span className="text-xs text-muted-foreground ml-auto">右键可选择单元格/表格样式 · 存储仍为 RichContent（导出兼容）</span>
        </CardContent>
      </Card>

      <UniverDocsEditor ref={editorRef} initialDocData={initialDocData} fields={fields} height={720} />
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

export default UniverWordDesigner