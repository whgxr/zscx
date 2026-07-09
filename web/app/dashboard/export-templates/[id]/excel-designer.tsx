"use client"

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Save,
  Upload,
  Eye,
  Database,
  FileSpreadsheet,
  Settings,
} from 'lucide-react'
import { ExportTemplate, DataTable, TableField } from '@prisma/client'
import type { IWorkbookData } from '@univerjs/core'
import { UniverSheetEditor, UniverSheetEditorHandle } from '@/components/univer-sheet-editor'
import * as ExcelJS from 'exceljs'

interface TemplateWithTable extends ExportTemplate {
  table: DataTable & {
    fields: TableField[]
  }
}

interface CellData {
  value: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  bgColor?: string
  textColor?: string
  fontSize?: number
  borderTop?: string
  borderBottom?: string
  borderLeft?: string
  borderRight?: string
  wrapText?: boolean
  rowSpan?: number
  colSpan?: number
  mergeHidden?: boolean
  formula?: string
}

interface PageSetup {
  paperSize: 'A4' | 'A3' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  headerMargin: number
  footerMargin: number
  printTitleRows?: string
  printTitleCols?: string
}

interface ExcelTemplateDesignerProps {
  template: TemplateWithTable
}

const FIELD_PATTERN = '\\{\\{[^}]+\\}\\}'

function convertOldGridToUniverData(
  grid: CellData[][],
  rowHeights: number[],
  colWidths: number[]
): IWorkbookData {
  const sheetId = 'sheet-01'
  const rowCount = grid.length
  const columnCount = grid[0]?.length ?? 0

  const cellData: Record<number, Record<number, { v: any; s?: number }>> = {}
  const styles: any[] = []
  const styleMap = new Map<string, number>()

  function getStyleId(cell: CellData): number | undefined {
    const hasStyle =
      cell.bold || cell.italic || cell.underline ||
      cell.align || cell.verticalAlign ||
      cell.bgColor || cell.textColor ||
      cell.fontSize || cell.wrapText

    if (!hasStyle) return undefined

    const key = JSON.stringify({
      bl: cell.bold ? 1 : undefined,
      it: cell.italic ? 1 : undefined,
      ul: cell.underline ? { s: 1 } : undefined,
      ht: cell.align === 'left' ? 1 : cell.align === 'center' ? 2 : cell.align === 'right' ? 3 : undefined,
      vt: cell.verticalAlign === 'top' ? 1 : cell.verticalAlign === 'middle' ? 2 : cell.verticalAlign === 'bottom' ? 3 : undefined,
      bg: cell.bgColor ? { rgb: cell.bgColor.replace('#', '') } : undefined,
      cl: cell.textColor ? { rgb: cell.textColor.replace('#', '') } : undefined,
      fs: cell.fontSize || undefined,
      tb: cell.wrapText ? 2 : undefined,
    })

    if (styleMap.has(key)) return styleMap.get(key)

    const styleObj: any = {}
    if (cell.bold) styleObj.bl = 1
    if (cell.italic) styleObj.it = 1
    if (cell.underline) styleObj.ul = { s: 1 }
    if (cell.align) {
      styleObj.ht = cell.align === 'left' ? 1 : cell.align === 'center' ? 2 : 3
    }
    if (cell.verticalAlign) {
      styleObj.vt = cell.verticalAlign === 'top' ? 1 : cell.verticalAlign === 'middle' ? 2 : 3
    }
    if (cell.bgColor) {
      styleObj.bg = { rgb: cell.bgColor.replace('#', '') }
    }
    if (cell.textColor) {
      styleObj.cl = { rgb: cell.textColor.replace('#', '') }
    }
    if (cell.fontSize) {
      styleObj.fs = cell.fontSize
    }
    if (cell.wrapText) {
      styleObj.tb = 2
    }

    const id = styles.length
    styles.push(styleObj)
    styleMap.set(key, id)
    return id
  }

  const mergeData: any[] = []

  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < columnCount; c++) {
      const cell = grid[r]?.[c]
      if (!cell || cell.mergeHidden) continue

      const styleId = getStyleId(cell)
      const cellObj: any = { v: cell.value || '' }

      if (cell.formula) {
        cellObj.f = cell.formula
      }

      if (styleId !== undefined) {
        cellObj.s = styleId
      }

      if (!cellData[r]) cellData[r] = {}
      cellData[r][c] = cellObj

      if (cell.rowSpan && cell.colSpan && (cell.rowSpan > 1 || cell.colSpan > 1)) {
        mergeData.push({
          startRow: r,
          endRow: r + cell.rowSpan - 1,
          startColumn: c,
          endColumn: c + cell.colSpan - 1,
        })
      }
    }
  }

  const rowData: Record<number, { h?: number; hd?: number }> = {}
  for (let r = 0; r < rowCount; r++) {
    if (rowHeights[r] && rowHeights[r] !== 24) {
      rowData[r] = { h: rowHeights[r] }
    }
  }

  const colData: Record<number, { w?: number; hd?: number }> = {}
  for (let c = 0; c < columnCount; c++) {
    if (colWidths[c] && colWidths[c] !== 100) {
      colData[c] = { w: colWidths[c] }
    }
  }

  // Convert styles array to Record format required by IWorkbookData
  const stylesRecord: Record<string, any> = {}
  styles.forEach((s, i) => {
    stylesRecord[String(i)] = s
  })

  return {
    id: 'workbook-01',
    name: '',
    appVersion: '0.25.1',
    locale: 'zhCN',
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: 'Sheet1',
        cellData,
        rowCount: Math.max(rowCount, 30),
        columnCount: Math.max(columnCount, 15),
        rowData,
        colData,
        mergeData,
        defaultRowHeight: 24,
        defaultColumnWidth: 100,
      },
    },
    styles: stylesRecord,
  } as IWorkbookData
}

function extractCellsForPreview(data: IWorkbookData): { rows: number; cols: number; cells: Map<string, { v: string; s?: any; merge?: { rowSpan: number; colSpan: number } }>; merges: any[] } {
  const sheetId = data.sheetOrder?.[0]
  if (!sheetId || !data.sheets?.[sheetId]) {
    return { rows: 0, cols: 0, cells: new Map(), merges: [] }
  }

  const sheet = data.sheets[sheetId]
  const cells = new Map<string, { v: string; s?: any; merge?: { rowSpan: number; colSpan: number } }>()
  const styles: Record<string, any> = (data as any).styles || {}

  const sheetCellData = sheet.cellData || {}
  for (const r of Object.keys(sheetCellData)) {
    const row = sheetCellData[Number(r)]
    if (!row) continue
    for (const c of Object.keys(row)) {
      const cell = row[Number(c)]
      if (!cell) continue
      const style = cell.s !== undefined ? styles[String(cell.s)] : undefined
      cells.set(`${r},${c}`, {
        v: cell.v?.toString() || '',
        s: style,
      })
    }
  }

  const merges = (sheet as any).mergeData || []
  for (const merge of merges) {
    const key = `${merge.startRow},${merge.startColumn}`
    const existing = cells.get(key)
    if (existing) {
      existing.merge = {
        rowSpan: merge.endRow - merge.startRow + 1,
        colSpan: merge.endColumn - merge.startColumn + 1,
      }
    }
  }

  return {
    rows: sheet.rowCount || 0,
    cols: sheet.columnCount || 0,
    cells,
    merges,
  }
}

export function ExcelTemplateDesigner({ template }: ExcelTemplateDesignerProps) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  const [saving, setSaving] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [pageSetupDialogOpen, setPageSetupDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const univerRef = useRef<UniverSheetEditorHandle>(null)

  const table = template.table
  const allFields = table.fields

  const initPageSetup = useCallback((): PageSetup => {
    const cfg = template.config as any
    if (cfg && cfg.pageSetup) {
      return cfg.pageSetup
    }
    return {
      paperSize: 'A4',
      orientation: 'portrait',
      marginTop: 0.75,
      marginBottom: 0.75,
      marginLeft: 0.7,
      marginRight: 0.7,
      headerMargin: 0.3,
      footerMargin: 0.3,
      printTitleRows: '',
      printTitleCols: '',
    }
  }, [template.config])

  const [pageSetup, setPageSetup] = useState<PageSetup>(initPageSetup)

  const initUniverData = useCallback((): IWorkbookData | undefined => {
    const cfg = template.config as any
    if (cfg && cfg.univerData) {
      return cfg.univerData
    }
    if (cfg && cfg.grid) {
      const rowHeights: number[] = cfg.rowHeights || []
      const colWidths: number[] = cfg.colWidths || []
      return convertOldGridToUniverData(cfg.grid, rowHeights, colWidths)
    }
    return undefined
  }, [template.config])

  const [initialUniverData] = useState<IWorkbookData | undefined>(initUniverData)
  const [previewData, setPreviewData] = useState<IWorkbookData | null>(null)

  const handleFieldClick = (fieldName: string) => {
    univerRef.current?.insertField(fieldName)
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const success = await univerRef.current?.importFromExcel(file)
      if (success) {
        setImportDialogOpen(false)
        alert('导入成功！')
      } else {
        alert('导入失败')
      }
    } catch (err) {
      console.error('Import error:', err)
      alert('导入失败：' + (err as Error).message)
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const univerData = univerRef.current?.getData() ?? null

      const res = await fetch('/api/export-templates/' + template.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          config: {
            univerData,
            pageSetup,
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
    } catch (err) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handlePreview = () => {
    const data = univerRef.current?.getData() ?? null
    setPreviewData(data)
    setPreviewDialogOpen(true)
  }

  const countFieldsInPreview = (data: IWorkbookData | null): number => {
    if (!data) return 0
    let count = 0
    const regex = new RegExp(FIELD_PATTERN, 'g')
    const sheetId = data.sheetOrder?.[0]
    if (!sheetId || !data.sheets?.[sheetId]) return 0
    const sheet = data.sheets[sheetId]
    const cellData = sheet.cellData || {}
    for (const r of Object.keys(cellData)) {
      const row = cellData[Number(r)]
      if (!row) continue
      for (const c of Object.keys(row)) {
        const cell = row[Number(c)]
        if (!cell?.v) continue
        const matches = (cell.v as string).match(regex)
        if (matches) count += matches.length
      }
    }
    return count
  }

  const preview = previewData ? extractCellsForPreview(previewData) : null
  const fieldCount = countFieldsInPreview(univerRef.current?.getData() ?? null)

  const renderPreviewTable = () => {
    if (!preview) return null

    const { rows, cols, cells, merges } = preview
    const mergeHidden = new Set<string>()

    for (const merge of merges) {
      for (let r = merge.startRow; r <= merge.endRow; r++) {
        for (let c = merge.startColumn; c <= merge.endColumn; c++) {
          if (r === merge.startRow && c === merge.startColumn) continue
          mergeHidden.add(`${r},${c}`)
        }
      }
    }

    const renderedRows: React.ReactNode[] = []
    for (let r = 0; r < rows; r++) {
      const tds: React.ReactNode[] = []
      let hasContent = false
      for (let c = 0; c < cols; c++) {
        if (mergeHidden.has(`${r},${c}`)) continue
        const cell = cells.get(`${r},${c}`)
        if (!cell && !mergeHidden.has(`${r},${c}`)) continue
        if (cell) hasContent = true
        const merge = cell?.merge
        tds.push(
          <td
            key={c}
            rowSpan={merge?.rowSpan || 1}
            colSpan={merge?.colSpan || 1}
            className="border border-black px-2 py-1 min-w-[80px]"
            style={{
              fontWeight: cell?.s?.bl ? 'bold' : undefined,
              fontStyle: cell?.s?.it ? 'italic' : undefined,
              textAlign: cell?.s?.ht === 1 ? 'left' : cell?.s?.ht === 2 ? 'center' : cell?.s?.ht === 3 ? 'right' : undefined,
              backgroundColor: cell?.s?.bg?.rgb ? '#' + cell.s.bg.rgb : undefined,
              color: cell?.s?.cl?.rgb ? '#' + cell.s.cl.rgb : undefined,
              fontSize: cell?.s?.fs ? cell.s.fs + 'px' : undefined,
            }}
          >
            {cell?.v || '\u00A0'}
          </td>
        )
      }
      if (hasContent || tds.length > 0) {
        renderedRows.push(<tr key={r}>{tds}</tr>)
      }
    }

    return renderedRows
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/export-templates')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Excel模板设计器</h1>
            <p className="text-gray-500 text-sm">
              {table.label}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                导入Excel样表
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>导入Excel样表</DialogTitle>
                <DialogDescription>
                  上传一个Excel文件作为模板基础，之后可以编辑并绑定数据库字段。
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  ref={fileInputRef}
                  onChange={handleImportExcel}
                  className="w-full"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="w-4 h-4 mr-2" />
            预览效果
          </Button>
          <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>数据填充预览</DialogTitle>
                <DialogDescription>
                  查看模板填充示例数据后的效果
                </DialogDescription>
              </DialogHeader>
              <div className="border rounded-lg overflow-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {renderPreviewTable()}
                  </tbody>
                </table>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={() => router.push('/dashboard/export-templates')}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存模板'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-2">
          <Card className="h-full">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                可用字段
              </CardTitle>
              <CardDescription className="text-xs">
                点击插入字段到当前单元格
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {allFields.map(field => (
                  <button
                    key={field.name}
                    onClick={() => handleFieldClick(field.name)}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors cursor-pointer"
                  >
                    <div className="font-medium truncate">{field.label}</div>
                    <div className="text-xs text-gray-400 font-mono">
                      {'{{' + field.name + '}}'}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="col-span-10">
          <Card className="overflow-hidden">
            <UniverSheetEditor
              ref={univerRef}
              initialData={initialUniverData}
              fields={allFields.map(f => ({ id: f.id, name: f.name, label: f.label, type: f.type }))}
              height="70vh"
            />
          </Card>

          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-3 h-3" />
              <span>Univer电子表格编辑器</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPageSetupDialogOpen(true)}
              >
                <Settings className="w-3 h-3 mr-1" />
                页面布局
              </Button>
              <Badge variant="outline" className="text-xs">
                {fieldCount} 个字段绑定
              </Badge>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={pageSetupDialogOpen} onOpenChange={setPageSetupDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>页面布局设置</DialogTitle>
            <DialogDescription>
              设置打印纸张大小、方向和边距
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>纸张大小</Label>
                <Select
                  value={pageSetup.paperSize}
                  onValueChange={(v: any) => setPageSetup(p => ({ ...p, paperSize: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A3">A3</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>方向</Label>
                <Select
                  value={pageSetup.orientation}
                  onValueChange={(v: any) => setPageSetup(p => ({ ...p, orientation: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">纵向</SelectItem>
                    <SelectItem value="landscape">横向</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>上边距 (英寸)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={pageSetup.marginTop}
                  onChange={(e) => setPageSetup(p => ({ ...p, marginTop: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>下边距 (英寸)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={pageSetup.marginBottom}
                  onChange={(e) => setPageSetup(p => ({ ...p, marginBottom: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>左边距 (英寸)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={pageSetup.marginLeft}
                  onChange={(e) => setPageSetup(p => ({ ...p, marginLeft: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>右边距 (英寸)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={pageSetup.marginRight}
                  onChange={(e) => setPageSetup(p => ({ ...p, marginRight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>页眉边距 (英寸)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={pageSetup.headerMargin}
                  onChange={(e) => setPageSetup(p => ({ ...p, headerMargin: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>页脚边距 (英寸)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={pageSetup.footerMargin}
                  onChange={(e) => setPageSetup(p => ({ ...p, footerMargin: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>打印标题行 (如: 1:3)</Label>
              <Input
                placeholder="例如: 1:3 表示第1到3行为每页重复标题"
                value={pageSetup.printTitleRows || ''}
                onChange={(e) => setPageSetup(p => ({ ...p, printTitleRows: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPageSetupDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => setPageSetupDialogOpen(false)}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
