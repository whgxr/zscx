"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog"
import { ArrowLeft, Save, Eye, Database, Settings } from 'lucide-react'
import { ExportTemplate, DataTable, TableField } from '@prisma/client'
import UniverSheetsEditor, { UniverSheetsEditorHandle } from '@/components/univer/univer-sheets-editor'
import {
  legacyGridToWorkbookData,
  workbookDataToLegacyGrid,
  LegacyGridConfig,
} from '@/lib/univer-sheets-adapter'
import { useTabs, resolveKeyFromHref } from '@/components/layout/tabs-context'

interface TemplateWithTable extends ExportTemplate {
  table: DataTable & { fields: TableField[] }
}

interface UniverExcelDesignerProps {
  template: TemplateWithTable
}

export function UniverExcelDesigner({ template }: UniverExcelDesignerProps) {
  const router = useRouter()
  const { prepareLabel } = useTabs()
  const editorRef = useRef<UniverSheetsEditorHandle>(null)

  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  const [saving, setSaving] = useState(false)
  const [pageSetupOpen, setPageSetupOpen] = useState(false)
  const [fieldCount, setFieldCount] = useState(0)

  const allFields = template.table.fields

  useEffect(() => {
    prepareLabel(resolveKeyFromHref(window.location.href), `Excel：${template.name}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id])

  /** 初始快照：优先 config.univerData，否则由旧 grid 迁移生成 */
  const initialUniverData = useMemo(() => {
    const cfg = template.config as any
    if (cfg?.univerData && cfg.univerData.sheetOrder?.length) {
      return cfg.univerData
    }
    const legacy: LegacyGridConfig = {
      grid: cfg?.grid || [],
      rowHeights: cfg?.rowHeights || [],
      colWidths: cfg?.colWidths || [],
    }
    return legacyGridToWorkbookData(legacy)
  }, [template.config])

  const fieldCountOfSnapshot = () => {
    const snap = editorRef.current?.getSnapshot()
    if (!snap) return 0
    const data = workbookDataToLegacyGrid(snap)
    const pattern = /\{\{([a-zA-Z][a-zA-Z0-9_.]*)\}\}/g
    let count = 0
    for (const row of data.grid || []) {
      for (const cell of row) {
        const m = (cell.value || '').match(pattern)
        if (m) count += m.length
      }
    }
    return count
  }

  async function handleSave() {
    setSaving(true)
    try {
      const snapshot = editorRef.current?.getSnapshot()
      if (!snapshot) {
        alert('未获取到表格数据，请检查 Univer 是否就绪')
        return
      }
      setFieldCount(fieldCountOfSnapshot())
      const cfg = template.config as any
      const res = await fetch('/api/export-templates/' + template.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          config: {
            univerData: snapshot,
            pageSetup: cfg?.pageSetup || {},
            type: 'EXCEL_TEMPLATE',
          },
        }),
      })
      if (res.ok) {
        alert('保存成功')
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (e) {
      console.error('save error', e)
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  /** 预览：把当前快照转回旧网格，用简单表格渲染（字段显示为占位符文本） */
  function openPreview() {
    const snap = editorRef.current?.getSnapshot()
    if (!snap) { alert('Univer 尚未就绪'); return }
    const { grid, rowHeights, colWidths } = workbookDataToLegacyGrid(snap)
    const win = window.open('', '_blank')
    if (!win) { alert('浏览器阻止了新窗口'); return }
    const htmlRows = grid.map((row, r) => {
      const cells = row.map((cell, c) => {
        if (cell.mergeHidden) return ''
        const v = cell.value || '\u00A0'
        const styled = [
          cell.bold ? 'font-weight:bold' : '',
          cell.fontSize ? `font-size:${cell.fontSize}px` : '',
          cell.align ? `text-align:${cell.align}` : '',
          cell.bgColor ? `background:${cell.bgColor}` : '',
        ].join(';')
        return `<td rowspan="${cell.rowSpan || 1}" colspan="${cell.colSpan || 1}" style="border:1px solid #999;padding:4px 6px;${styled}">${v.replace(/</g, '&lt;')}</td>`
      }).join('')
      return `<tr style="height:${rowHeights?.[r] || 24}px">${cells}</tr>`
    }).join('')
    win.document.write(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>${name} 预览</title>
<style>body{margin:0;background:#e5e7eb;padding:24px;font-family:sans-serif}.sheet{background:#fff;padding:16px;box-shadow:0 2px 10px rgba(0,0,0,.25)}table{border-collapse:collapse;width:100%;table-layout:fixed}</style>
</head><body><div class="sheet"><table><tbody>${htmlRows}</tbody></table></div></body></html>`)
    win.document.close()
  }

  const pageSetup = (template.config as any)?.pageSetup || {}

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/export-templates')}>
            <ArrowLeft className="w-4 h-4 mr-2" /> 返回
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Excel 模板设计器（Univer）</h1>
            <p className="text-gray-500 text-sm">
              {template.table.label} · <span className="font-mono">{name}</span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openPreview}>
            <Eye className="w-4 h-4 mr-2" /> 预览效果
          </Button>
          <Dialog open={pageSetupOpen} onOpenChange={setPageSetupOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Settings className="w-4 h-4 mr-2" /> 页面布局
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>页面布局设置</DialogTitle></DialogHeader>
              <div className="space-y-3 py-3 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>纸张</Label>
                    <div className="text-muted-foreground">{pageSetup.paperSize || 'A4'}</div>
                  </div>
                  <div className="space-y-1">
                    <Label>方向</Label>
                    <div className="text-muted-foreground">{pageSetup.orientation === 'landscape' ? '横向' : '纵向'}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  页面边距、打印标题等以保存时的 pageSetup 为准（可在后续版本中开放编辑）。
                </div>
              </div>
              <DialogFooter><DialogClose asChild><Button variant="outline">关闭</Button></DialogClose></DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => router.push('/dashboard/export-templates')}>取消</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" /> {saving ? '保存中...' : '保存模板'}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Label className="text-muted-foreground">模板名称</Label>
            <Input className="w-64 h-8" value={name} onChange={(e) => setName(e.target.value)} />
            <Separator orientation="vertical" className="h-6" />
            <Badge variant="outline" className="text-xs"><Database className="w-3 h-3 mr-1" /> {allFields.length} 个可用字段</Badge>
            <Badge variant="outline" className="text-xs">已绑定 {fieldCount} 个字段</Badge>
          </div>
        </CardContent>
      </Card>

      <UniverSheetsEditor ref={editorRef} initialUniverData={initialUniverData} fields={allFields} height={640} />

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div>编辑体验由 Univer 提供：合并单元格、边框、公式、样式等均可在工具栏直接操作。</div>
        <div><Badge variant="secondary">存储格式: Univer 快照 (config.univerData)</Badge></div>
      </div>
    </div>
  )
}

export default UniverExcelDesigner