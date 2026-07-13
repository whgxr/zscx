"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Separator } from '@/components/ui/separator'
import { TableField } from '@prisma/client'
import {
  Save, Upload, Eye, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Palette, Type, Plus, Trash2,
  Database, Merge, Unlink, Grid3x3, Minus, Calculator, Settings, X, Search,
} from 'lucide-react'
import * as ExcelJS from 'exceljs'
import { CellData, PageSetup, FIELD_PATTERN, getColLabel, emptyCell } from '@/types/cell-data'
import {
  FormExcelConfig, SubTableConfig, defaultFormExcelConfig, DEFAULT_FORM_COL_WIDTHS,
  migrateFormLayoutToExcel,
} from '@/types/form-excel-config'

/* ===================== 单元格显示组件 ===================== */

function CellDisplay({ value, fields }: { value: string; fields: TableField[] }) {
  const regex = new RegExp(FIELD_PATTERN, 'g')
  const parts: { text: string; isField: boolean }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index), isField: false })
    }
    parts.push({ text: match[0], isField: true })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex), isField: false })
  }

  return (
    <div className="truncate whitespace-nowrap" style={{ fontSize: 'inherit' }}>
      {parts.map((part, i) => {
        if (part.isField) {
          const fieldName = part.text.slice(2, -2)
          const field = fields.find(f => f.name === fieldName)
          return (
            <span key={i} className="text-blue-600 bg-blue-50 px-0.5 rounded">
              {field?.label || fieldName}
            </span>
          )
        }
        return <span key={i}>{part.text}</span>
      })}
    </div>
  )
}

/* ===================== 子表配置表单 ===================== */

function SubTableConfigForm({
  availableTables, fields, initial, onSave, onCancel
}: {
  availableTables: Array<{ id: number; name: string; label: string }>
  fields: TableField[]
  initial: SubTableConfig | null
  onSave: (config: SubTableConfig) => void
  onCancel: () => void
}) {
  const [selectedTableId, setSelectedTableId] = useState<number>(initial?.detailTableId || 0)
  const [selectedFields, setSelectedFields] = useState<string[]>(initial?.fields || [])
  const [label, setLabel] = useState(initial?.label || '')
  const [tableFields, setTableFields] = useState<TableField[]>([])

  useEffect(() => {
    if (selectedTableId) {
      fetch(`/api/tables/${selectedTableId}/fields`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.fields) setTableFields(data.fields.filter((f: TableField) => f.showInForm))
        })
        .catch(() => {})
    }
  }, [selectedTableId])

  const selectedTable = availableTables.find(t => t.id === selectedTableId)

  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1">
        <Label className="text-xs">关联子表</Label>
        <Select value={String(selectedTableId)}
          onValueChange={v => {
            setSelectedTableId(Number(v))
            const t = availableTables.find(t => t.id === Number(v))
            if (t && !label) setLabel(t.label)
          }}>
          <SelectTrigger className="h-8"><SelectValue placeholder="选择子表" /></SelectTrigger>
          <SelectContent>
            {availableTables.map(t => (
              <SelectItem key={t.id} value={String(t.id)}>{t.label} ({t.name})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">显示名称</Label>
        <Input className="h-8" value={label}
          onChange={e => setLabel(e.target.value)} placeholder="如：被征收人家庭成员" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">子表显示字段</Label>
        <div className="border rounded p-2 space-y-1 max-h-40 overflow-y-auto">
          {tableFields.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">
              {selectedTableId ? '该子表没有可显示的字段' : '请先选择关联子表'}
            </p>
          ) : tableFields.map(f => (
            <label key={f.id} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={selectedFields.includes(f.name)}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedFields(prev => [...prev, f.name])
                  } else {
                    setSelectedFields(prev => prev.filter(n => n !== f.name))
                  }
                }} />
              {f.label} <code className="text-blue-500 text-[10px]">{'{'}{'{'}{f.name}{'}'}{'}'}</code>
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={() => {
          if (!selectedTableId || !label || selectedFields.length === 0) {
            alert('请选择子表、填写名称并选择字段')
            return
          }
          onSave({
            detailTableId: selectedTableId,
            detailTableName: selectedTable?.name || '',
            label,
            fields: selectedFields,
          })
        }} disabled={!selectedTableId || !label || selectedFields.length === 0}>
          确定
        </Button>
      </DialogFooter>
    </div>
  )
}

/* ===================== 主组件 ===================== */

interface FormExcelDesignerProps {
  tableId: number
  fields: TableField[]
  initialConfig?: FormExcelConfig | any | null
  onSave: (config: FormExcelConfig) => Promise<void>
}

export default function FormExcelDesigner({
  tableId, fields, initialConfig, onSave
}: FormExcelDesignerProps) {
  const [saving, setSaving] = useState(false)
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const [selection, setSelection] = useState<{
    start: { row: number; col: number }
    end: { row: number; col: number }
  } | null>(null)
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false)
  const [pageSetupDialogOpen, setPageSetupDialogOpen] = useState(false)
  const [subTableDialogOpen, setSubTableDialogOpen] = useState(false)
  const [editingSubTable, setEditingSubTable] = useState<SubTableConfig | null>(null)
  const [availableDetailTables, setAvailableDetailTables] = useState<Array<{
    id: number; name: string; label: string
  }>>([])

  // 从初始配置初始化
  const initConfig = initialConfig
    ? migrateFormLayoutToExcel(initialConfig)
    : defaultFormExcelConfig()

  const [grid, setGrid] = useState<CellData[][]>(initConfig.grid)
  const [rowHeights, setRowHeights] = useState<number[]>(initConfig.rowHeights)
  const [colWidths, setColWidths] = useState<number[]>(initConfig.colWidths)
  const [pageSetup, setPageSetup] = useState<PageSetup>(initConfig.pageSetup)
  const [subTables, setSubTables] = useState<SubTableConfig[]>(initConfig.subTables || [])
  const [formulaInput, setFormulaInput] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSelecting = useRef(false)
  const resizingCol = useRef<number | null>(null)
  const resizeStartPos = useRef<number>(0)
  const resizeStartSize = useRef<number>(0)

  // 加载可选子表
  useEffect(() => {
    fetch('/api/tables?onlyDetail=true')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tables) setAvailableDetailTables(data.tables)
      })
      .catch(() => {})
  }, [])

  /* ---- 单元格操作 ---- */

  const getCell = (row: number, col: number): CellData => {
    if (row < grid.length && col < grid[row].length) {
      return grid[row][col]
    }
    return emptyCell()
  }

  const setCell = useCallback((row: number, col: number, data: Partial<CellData>) => {
    setGrid(prev => prev.map((r, ri) =>
      ri !== row ? r : r.map((c, ci) => ci !== col ? c : { ...c, ...data })
    ))
  }, [])

  const setRangeStyle = useCallback((style: Partial<CellData>) => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)

    setGrid(prev => prev.map((row, ri) => {
      if (ri < minRow || ri > maxRow) return row
      return row.map((cell, ci) => {
        if (ci < minCol || ci > maxCol) return cell
        if (style.fontSize && style.fontSize !== cell.fontSize) {
          setRowHeights(prevH => {
            const next = [...prevH]
            next[ri] = Math.max(24, (style.fontSize || 11) * 1.6)
            return next
          })
        }
        return { ...cell, ...style }
      })
    }))
  }, [selection])

  /* ---- 合并 ---- */

  const mergeCells = useCallback(() => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)
    if (minRow === maxRow && minCol === maxCol) return

    setGrid(prev => prev.map((row, ri) =>
      row.map((cell, ci) => {
        if (ri === minRow && ci === minCol) {
          return { ...cell, rowSpan: maxRow - minRow + 1, colSpan: maxCol - minCol + 1 }
        }
        if (ri >= minRow && ri <= maxRow && ci >= minCol && ci <= maxCol) {
          return { ...cell, mergeHidden: true }
        }
        return cell
      })
    ))
  }, [selection])

  const unmergeCells = useCallback(() => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)

    setGrid(prev => prev.map((row, ri) =>
      row.map((cell, ci) => {
        if (ri >= minRow && ri <= maxRow && ci >= minCol && ci <= maxCol) {
          const { rowSpan, colSpan, mergeHidden, ...rest } = cell
          return rest
        }
        return cell
      })
    ))
  }, [selection])

  /* ---- 边框 ---- */

  const setAllBorders = useCallback((borderStyle: string) => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)

    setGrid(prev => prev.map((row, ri) =>
      row.map((cell, ci) => {
        if (ri < minRow || ri > maxRow || ci < minCol || ci > maxCol) return cell
        return {
          ...cell,
          borderTop: borderStyle, borderBottom: borderStyle,
          borderLeft: borderStyle, borderRight: borderStyle,
        }
      })
    ))
  }, [selection])

  const clearAllBorders = useCallback(() => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)

    setGrid(prev => prev.map((row, ri) =>
      row.map((cell, ci) => {
        if (ri < minRow || ri > maxRow || ci < minCol || ci > maxCol) return cell
        const { borderTop, borderBottom, borderLeft, borderRight, ...rest } = cell
        return rest
      })
    ))
  }, [selection])

  /* ---- 行列操作 ---- */

  const setColWidth = (col: number, width: number) => {
    setColWidths(prev => {
      const next = [...prev]
      next[col] = Math.max(40, width)
      return next
    })
  }

  const addRow = () => {
    const newRow = Array.from({ length: colWidths.length }, () => emptyCell())
    setGrid(prev => [...prev, newRow])
    setRowHeights(prev => [...prev, 24])
  }

  const addCol = () => {
    setGrid(prev => prev.map(r => [...r, emptyCell()]))
    setColWidths(prev => [...prev, 100])
  }

  const deleteRow = () => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    if (grid.length <= 1) return
    setGrid(prev => prev.filter((_, i) => i < minRow || i > maxRow))
    setRowHeights(prev => prev.filter((_, i) => i < minRow || i > maxRow))
  }

  const deleteCol = () => {
    if (!selection) return
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)
    if (colWidths.length <= 1) return
    setGrid(prev => prev.map(r => r.filter((_, i) => i < minCol || i > maxCol)))
    setColWidths(prev => prev.filter((_, i) => i < minCol || i > maxCol))
  }

  /* ---- 选择与导航 ---- */

  const handleCellClick = (row: number, col: number) => {
    setActiveCell({ row, col })
    setSelection({ start: { row, col }, end: { row, col } })
    isSelecting.current = true
  }

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isSelecting.current || !selection) return
    setSelection(prev => prev ? {
      start: { row: prev.start.row, col: prev.start.col },
      end: { row, col },
    } : { start: { row, col }, end: { row, col } })
  }

  const handleMouseUp = () => {
    isSelecting.current = false
    resizingCol.current = null
  }

  const handleColResizeStart = (e: React.MouseEvent, colIdx: number) => {
    e.preventDefault()
    e.stopPropagation()
    resizingCol.current = colIdx
    resizeStartPos.current = e.clientX
    resizeStartSize.current = colWidths[colIdx]
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeCell) return
    const { row, col } = activeCell
    let newRow = row, newCol = col
    switch (e.key) {
      case 'ArrowUp': newRow = Math.max(0, row - 1); break
      case 'ArrowDown': newRow = Math.min(grid.length - 1, row + 1); break
      case 'ArrowLeft': newCol = Math.max(0, col - 1); break
      case 'ArrowRight': newCol = Math.min(colWidths.length - 1, col + 1); break
      default: return
    }
    e.preventDefault()
    handleCellClick(newRow, newCol)
  }

  /* ---- 插入字段 ---- */

  const insertField = (fieldName: string) => {
    if (!activeCell) return
    const { row, col } = activeCell
    const current = grid[row]?.[col]?.value || ''
    setCell(row, col, { value: current + `{{${fieldName}}}` })
    setFieldDialogOpen(false)
  }

  /* ---- 公式 ---- */

  const insertFormula = (formula: string) => {
    if (!activeCell || !formula) return
    const { row, col } = activeCell
    const value = `=${formula}`
    setCell(row, col, { value, formula })
    setFormulaDialogOpen(false)
  }

  /* ---- 导入Excel ---- */

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const buffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      const ws = workbook.worksheets[0]
      if (!ws) return

      const newGrid: CellData[][] = []
      const newRowHeights: number[] = []
      const newColWidths: number[] = []

      if (ws.columns) {
        ws.columns.forEach(col => {
          newColWidths.push(col.width ? col.width * 7 : 100)
        })
      }

      ws.eachRow((row, _rowNum) => {
        const cells: CellData[] = []
        let maxCol = row.cellCount
        if (ws.columns && ws.columns.length > maxCol) maxCol = ws.columns.length

        for (let i = 1; i <= maxCol; i++) {
          const cell = row.getCell(i)
          const cellData: CellData = { value: cell.text || '' }
          if (cell.font) {
            if (cell.font.bold) cellData.bold = true
            if (cell.font.italic) cellData.italic = true
            if (cell.font.underline) cellData.underline = true
            if (cell.font.size) cellData.fontSize = cell.font.size
            if (cell.font.color?.argb) cellData.textColor = cell.font.color.argb
          }
          if (cell.fill && 'fgColor' in cell.fill && (cell.fill as any).fgColor?.argb) cellData.bgColor = (cell.fill as any).fgColor.argb
          if (cell.alignment) {
            if (cell.alignment.horizontal) cellData.align = cell.alignment.horizontal as any
            if (cell.alignment.vertical) cellData.verticalAlign = cell.alignment.vertical as any
            if (cell.alignment.wrapText) cellData.wrapText = true
          }
          cells.push(cellData)
        }
        newGrid.push(cells)
        newRowHeights.push(24)
      })

      // 合并单元格
      if (ws.model?.merges) {
        for (const merge of ws.model.merges as any[]) {
          const { tl, br } = merge
          const minRow = tl.r - 1, maxRow = br.r - 1
          const minCol = tl.c - 1, maxCol = br.c - 1
          if (newGrid[minRow]?.[minCol]) {
            newGrid[minRow][minCol].rowSpan = maxRow - minRow + 1
            newGrid[minRow][minCol].colSpan = maxCol - minCol + 1
          }
          for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
              if (r === minRow && c === minCol) continue
              if (newGrid[r]?.[c]) newGrid[r][c].mergeHidden = true
            }
          }
        }
      }

      setGrid(newGrid)
      if (newColWidths.length > 0) setColWidths(newColWidths)
      if (newRowHeights.length > 0) setRowHeights(newRowHeights)
      setImportDialogOpen(false)
    } catch (err) {
      console.error('Import error:', err)
      alert('导入 Excel 失败')
    }
  }

  /* ---- 保存 ---- */

  const handleSave = async () => {
    setSaving(true)
    try {
      const config: FormExcelConfig = {
        grid,
        rowHeights,
        colWidths,
        pageSetup,
        subTables,
        defaultFontSize: 13,
        defaultRowHeight: 24,
      }
      await onSave(config)
    } catch (err) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  /* ---- 全局鼠标事件监听 ---- */

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (resizingCol.current !== null) {
        const delta = e.clientX - resizeStartPos.current
        const newWidth = Math.max(40, resizeStartSize.current + delta)
        setColWidth(resizingCol.current, newWidth)
      }
    }
    const handleGlobalMouseUp = () => {
      resizingCol.current = null
      isSelecting.current = false
    }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- 判断函数 ---- */

  const isCellSelected = (row: number, col: number): boolean => {
    if (!selection) return false
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol
  }

  const isCellActive = (row: number, col: number): boolean => {
    return activeCell?.row === row && activeCell?.col === col
  }

  const countFields = (): number => {
    const regex = new RegExp(FIELD_PATTERN, 'g')
    let count = 0
    for (const row of grid) {
      for (const cell of row) {
        const matches = cell.value.match(regex)
        if (matches) count += matches.length
      }
    }
    return count
  }

  const getActiveCellStyle = (key: keyof CellData): any => {
    if (!activeCell) return undefined
    return grid[activeCell.row]?.[activeCell.col]?.[key]
  }

  /* ===================== 渲染 ===================== */

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">表单布局设计</h2>
          <Badge variant="secondary" className="text-xs">
            {grid.length}行 × {colWidths.length}列
          </Badge>
          <Badge variant="outline" className="text-xs">
            {countFields()}个字段绑定
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="w-4 h-4 mr-1" />
            导入Excel样表
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(true)}>
            <Eye className="w-4 h-4 mr-1" />
            预览
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* 格式化工具栏 */}
      <Card>
        <CardContent className="p-2">
          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ bold: !getActiveCellStyle('bold') })}>
              <Bold className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ italic: !getActiveCellStyle('italic') })}>
              <Italic className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ underline: !getActiveCellStyle('underline') })}>
              <Underline className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ align: 'left' })}>
              <AlignLeft className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ align: 'center' })}>
              <AlignCenter className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ align: 'right' })}>
              <AlignRight className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 背景色 */}
            <div className="relative">
              <Button variant="ghost" size="sm" className="w-8 h-8">
                <Palette className="w-4 h-4" />
              </Button>
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-8 h-8"
                onChange={e => setRangeStyle({ bgColor: e.target.value })} />
            </div>
            {/* 文字颜色 */}
            <div className="relative">
              <Button variant="ghost" size="sm" className="w-8 h-8">
                <Type className="w-4 h-4" />
              </Button>
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-8 h-8"
                onChange={e => setRangeStyle({ textColor: e.target.value })} />
            </div>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 字号 */}
            <Input type="number" className="w-14 h-8 text-xs" min={6} max={72}
              value={getActiveCellStyle('fontSize') || 11}
              onChange={e => setRangeStyle({ fontSize: Number(e.target.value) })} />
            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={mergeCells}
              title="合并单元格">
              <Merge className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={unmergeCells}
              title="取消合并">
              <Unlink className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setAllBorders('1px solid #000')} title="设置边框">
              <Grid3x3 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={clearAllBorders}
              title="清除边框">
              <X className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant="outline" size="sm" className="h-8"
              onClick={() => setFieldDialogOpen(true)} disabled={!activeCell}>
              <Database className="w-4 h-4 mr-1" />
              插入字段
            </Button>
            <Button variant="outline" size="sm" className="h-8"
              onClick={() => { setFormulaInput(''); setFormulaDialogOpen(true) }}
              disabled={!activeCell}>
              <Calculator className="w-4 h-4 mr-1" />
              公式
            </Button>
            <Button variant="outline" size="sm" className="h-8"
              onClick={() => setPageSetupDialogOpen(true)}>
              <Settings className="w-4 h-4 mr-1" />
              页面布局
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={addRow} title="添加行">
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={addCol} title="添加列">
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8 text-red-500"
              onClick={deleteRow} title="删除行">
              <Minus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8 text-red-500"
              onClick={deleteCol} title="删除列">
              <Minus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 主体区域 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 左侧字段面板 */}
        <div className="col-span-2 border rounded-lg bg-white overflow-hidden">
          <div className="p-2 bg-gray-50 border-b text-sm font-medium text-gray-700 flex items-center gap-1">
            <Search className="w-3 h-3" />
            可用字段
          </div>
          <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
            {fields.filter(f => f.showInForm).map(field => (
              <button key={field.id}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!activeCell}
                onClick={() => { if (activeCell) insertField(field.name) }}>
                {field.label}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
                <code className="text-[10px] text-blue-400 ml-1">{'{'}{'{'}{field.name}{'}'}{'}'}</code>
              </button>
            ))}
            {fields.filter(f => f.showInForm).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">暂无可用字段</p>
            )}
          </div>
        </div>

        {/* 右侧表格编辑区 */}
        <div className="col-span-10 overflow-auto border rounded-lg bg-white"
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '36px', minWidth: '36px' }} />
              {colWidths.map((w, i) => (
                <col key={i} style={{ width: `${w}px`, minWidth: `${w}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 z-10 w-9 h-6 bg-gray-100 border border-gray-300 text-[10px] text-gray-500 font-normal text-center">
                  #
                </th>
                {colWidths.map((w, i) => (
                  <th key={i}
                    className="sticky top-0 z-10 h-6 bg-gray-100 border border-gray-300 text-[10px] text-gray-500 font-normal text-center relative"
                    style={{ minWidth: `${w}px` }}>
                    {getColLabel(i)}
                    <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400 z-20"
                      onMouseDown={e => handleColResizeStart(e, i)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => {
                // 整行都是 mergeHidden 则跳过
                if (row.every(c => c.mergeHidden)) return null
                return (
                  <tr key={ri} style={{ height: `${rowHeights[ri] || 24}px` }}>
                    <td className="bg-gray-50 border border-gray-300 text-[10px] text-gray-500 text-center select-none">
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => {
                      if (cell.mergeHidden) return null
                      const isSelected = isCellSelected(ri, ci)
                      const isActive = isCellActive(ri, ci)
                      const style: React.CSSProperties = {
                        fontSize: cell.fontSize || 11,
                        fontWeight: cell.bold ? 'bold' : undefined,
                        fontStyle: cell.italic ? 'italic' : undefined,
                        textDecoration: cell.underline ? 'underline' : undefined,
                        textAlign: cell.align || 'left',
                        verticalAlign: cell.verticalAlign || 'middle',
                        backgroundColor: cell.bgColor || undefined,
                        color: cell.textColor || undefined,
                        whiteSpace: cell.wrapText ? 'normal' : 'nowrap',
                      }

                      return (
                        <td key={ci}
                          rowSpan={cell.rowSpan || undefined}
                          colSpan={cell.colSpan || undefined}
                          className={`border border-gray-300 p-1 relative cursor-pointer select-none
                            ${isActive ? 'ring-2 ring-blue-500 ring-inset' : ''}
                            ${isSelected ? 'bg-blue-50' : ''}`}
                          style={style}
                          onClick={() => handleCellClick(ri, ci)}
                          onMouseEnter={() => handleCellMouseEnter(ri, ci)}>
                          {isActive ? (
                            <input
                              className="w-full h-full bg-transparent border-none outline-none text-[inherit] font-[inherit] p-0 m-0"
                              value={cell.value}
                              onChange={e => setCell(ri, ci, { value: e.target.value })}
                              onKeyDown={handleKeyDown}
                              autoFocus
                            />
                          ) : (
                            <CellDisplay value={cell.value} fields={fields} />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 子表模块区域 */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">子表模块</CardTitle>
            <Button variant="outline" size="sm" onClick={() => {
              setEditingSubTable(null)
              setSubTableDialogOpen(true)
            }}>
              <Plus className="w-4 h-4 mr-1" />
              添加子表
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-2">
          {subTables.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              尚未配置子表，点击"添加子表"配置关联的明细子表
            </p>
          ) : (
            <div className="space-y-2">
              {subTables.map((st, idx) => (
                <div key={idx}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{st.label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {st.detailTableName}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {st.fields.length} 个字段
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="w-6 h-6"
                      onClick={() => {
                        setEditingSubTable(st)
                        setSubTableDialogOpen(true)
                      }}>
                      <Settings className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="w-6 h-6 text-red-500"
                      onClick={() => setSubTables(prev => prev.filter((_, i) => i !== idx))}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== Dialog 弹窗 ===================== */}

      {/* 插入字段 */}
      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>插入字段</DialogTitle>
            <DialogDescription>点击字段将 {'{{'}字段名{'}}'} 插入到当前单元格</DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {fields.filter(f => f.showInForm).map(field => (
              <button key={field.id}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-blue-50 hover:text-blue-700 transition-colors"
                onClick={() => insertField(field.name)}>
                <span className="text-gray-700 mr-2">{field.label}</span>
                <code className="text-xs text-blue-500">{'{'}{'{'}{field.name}{'}'}{'}'}</code>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 导入Excel */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入 Excel 样表</DialogTitle>
            <DialogDescription>上传 .xlsx 文件作为表单布局模板（保留样式、合并单元格、字体等）</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls"
              className="hidden" onChange={handleImportExcel} />
            <Button variant="outline" className="w-full h-24 border-dashed"
              onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-6 h-6 mr-2 text-gray-400" />
              <span className="text-gray-500">点击选择 Excel 文件</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 预览 */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>表单布局预览</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto">
            <table className="border-collapse w-full">
              <colgroup>
                {colWidths.map((w, i) => (
                  <col key={i} style={{ width: `${w}px` }} />
                ))}
              </colgroup>
              <tbody>
                {grid.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => {
                      if (cell.mergeHidden) return null
                      return (
                        <td key={ci}
                          rowSpan={cell.rowSpan || undefined}
                          colSpan={cell.colSpan || undefined}
                          className="border border-gray-300 p-1 text-xs"
                          style={{
                            fontSize: cell.fontSize || 11,
                            fontWeight: cell.bold ? 'bold' : undefined,
                            fontStyle: cell.italic ? 'italic' : undefined,
                            textAlign: cell.align || 'left',
                            backgroundColor: cell.bgColor || undefined,
                            color: cell.textColor || undefined,
                          }}>
                          <CellDisplay value={cell.value} fields={fields} />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* 公式 */}
      <Dialog open={formulaDialogOpen} onOpenChange={setFormulaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>插入公式</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('SUM(')}>SUM</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('AVERAGE(')}>AVERAGE</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('COUNT(')}>COUNT</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('MAX(')}>MAX</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('MIN(')}>MIN</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('TODAY()')}>TODAY</Button>
            </div>
            <Input value={formulaInput} onChange={e => setFormulaInput(e.target.value)}
              placeholder="输入公式，如: =SUM(A1:A10)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormulaDialogOpen(false)}>取消</Button>
              <Button onClick={() => insertFormula(formulaInput)}>确定</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 页面布局 */}
      <Dialog open={pageSetupDialogOpen} onOpenChange={setPageSetupDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>页面布局设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">纸张大小</Label>
                <Select value={pageSetup.paperSize}
                  onValueChange={v => setPageSetup(prev => ({ ...prev, paperSize: v as any }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A3">A3</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">方向</Label>
                <Select value={pageSetup.orientation}
                  onValueChange={v => setPageSetup(prev => ({ ...prev, orientation: v as any }))}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="portrait">纵向</SelectItem>
                    <SelectItem value="landscape">横向</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">上边距 (mm)</Label>
                <Input type="number" className="h-8" value={pageSetup.marginTop}
                  onChange={e => setPageSetup(prev => ({ ...prev, marginTop: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">下边距 (mm)</Label>
                <Input type="number" className="h-8" value={pageSetup.marginBottom}
                  onChange={e => setPageSetup(prev => ({ ...prev, marginBottom: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">左边距 (mm)</Label>
                <Input type="number" className="h-8" value={pageSetup.marginLeft}
                  onChange={e => setPageSetup(prev => ({ ...prev, marginLeft: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">右边距 (mm)</Label>
                <Input type="number" className="h-8" value={pageSetup.marginRight}
                  onChange={e => setPageSetup(prev => ({ ...prev, marginRight: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setPageSetupDialogOpen(false)}>确定</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 子表配置 */}
      <Dialog open={subTableDialogOpen} onOpenChange={setSubTableDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSubTable ? '编辑子表' : '添加子表'}</DialogTitle>
          </DialogHeader>
          <SubTableConfigForm
            availableTables={availableDetailTables}
            fields={fields}
            initial={editingSubTable}
            onSave={(config) => {
              if (editingSubTable) {
                setSubTables(prev => prev.map(st =>
                  st.detailTableId === config.detailTableId ? config : st))
              } else {
                setSubTables(prev => [...prev, config])
              }
              setSubTableDialogOpen(false)
            }}
            onCancel={() => setSubTableDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}