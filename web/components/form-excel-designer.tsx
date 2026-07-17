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
  Loader2, Undo,
} from 'lucide-react'
import * as ExcelJS from 'exceljs'
import { CellData, PageSetup, FIELD_PATTERN, getColLabel, emptyCell } from '@/types/cell-data'
import {
  FormExcelConfig, SubTableConfig, defaultFormExcelConfig, DEFAULT_FORM_COL_WIDTHS,
  migrateFormLayoutToExcel,
} from '@/types/form-excel-config'

/* ===================== 单元格显示组件 ===================== */

function CellDisplay({ value, fields }: { value: any; fields: TableField[] }) {
  const safeValue = typeof value === 'string' ? value : value == null ? '' : String(value)
  const regex = new RegExp(FIELD_PATTERN, 'g')
  const parts: { text: string; isField: boolean }[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(safeValue)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: safeValue.slice(lastIndex, match.index), isField: false })
    }
    parts.push({ text: match[0], isField: true })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < safeValue.length) {
    parts.push({ text: safeValue.slice(lastIndex), isField: false })
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
  const [importing, setImporting] = useState(false)
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

  // 归一化 grid：确保合并区域的 mergeHidden 一致性
  const normalizedGrid = useCallback((g: CellData[][]): CellData[][] => {
    const ng = g.map(r => r.map(c => ({ ...c })))
    for (let r = 0; r < ng.length; r++) {
      for (let c = 0; c < (ng[r]?.length || 0); c++) {
        const cell = ng[r][c]
        if (cell.mergeHidden) continue
        const rs = cell.rowSpan || 1
        const cs = cell.colSpan || 1
        if (rs <= 1 && cs <= 1) continue
        // 标记所有被覆盖的子单元格
        for (let sr = r; sr < r + rs; sr++) {
          for (let sc = c; sc < c + cs; sc++) {
            if (sr === r && sc === c) continue
            if (ng[sr]?.[sc]) {
              ng[sr][sc].mergeHidden = true
            }
          }
        }
      }
    }
    return ng
  }, [])

  const [grid, setGrid] = useState<CellData[][]>(normalizedGrid(initConfig.grid))
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

  // 剪贴板与撤销
  const [clipboard, setClipboard] = useState<CellData[][] | null>(null)
  const undoStack = useRef<CellData[][][]>([])
  const undoRowHeights = useRef<number[][]>([])
  const undoColWidths = useRef<number[][]>([])
  const canUndo = undoStack.current.length > 0

  const pushUndo = useCallback(() => {
    undoStack.current = undoStack.current.slice(-49)
    undoRowHeights.current = undoRowHeights.current.slice(-49)
    undoColWidths.current = undoColWidths.current.slice(-49)
    undoStack.current.push(grid.map(r => r.map(c => ({ ...c }))))
    undoRowHeights.current.push([...rowHeights])
    undoColWidths.current.push([...colWidths])
  }, [grid, rowHeights, colWidths])

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return
    const prevGrid = undoStack.current.pop()!
    const prevRH = undoRowHeights.current.pop()!
    const prevCW = undoColWidths.current.pop()!
    setGrid(prevGrid)
    setRowHeights(prevRH)
    setColWidths(prevCW)
    setActiveCell(null)
    setSelection(null)
  }, [])

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

  const setCell = useCallback((row: number, col: number, data: Partial<CellData>, skipUndo?: boolean) => {
    if (!skipUndo) pushUndo()
    setGrid(prev => prev.map((r, ri) =>
      ri !== row ? r : r.map((c, ci) => ci !== col ? c : { ...c, ...data })
    ))
  }, [pushUndo])

  const setRangeStyle = useCallback((style: Partial<CellData>, skipUndo?: boolean) => {
    if (!selection) return
    if (!skipUndo) pushUndo()
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
    pushUndo()

    setGrid(prev => {
      // 深拷贝整个 grid
      const newGrid = prev.map(r => r.map(c => ({ ...c })))

      // 第一步：扫描整个 grid，清除所有 owner cell 在选区内的合并区域
      // 只清除 owner cell 落在选区中的合并，避免下方操作时误伤上方大合并
      for (let r = 0; r < newGrid.length; r++) {
        for (let c = 0; c < (newGrid[r]?.length || 0); c++) {
          const cell = newGrid[r][c]
          if (!cell?.rowSpan && !cell?.colSpan) continue

          const endR = r + (cell.rowSpan || 1) - 1
          const endC = c + (cell.colSpan || 1) - 1

          // 只有合并区域的 owner cell 位于选区内时才清除
          const ownerInSelection = r >= minRow && r <= maxRow && c >= minCol && c <= maxCol
          // 额外安全：如果选区与合并区域有重叠且 owner cell 在选区内，才清除
          const overlaps = r <= maxRow && endR >= minRow && c <= maxCol && endC >= minCol
          if (ownerInSelection && overlaps) {
            // 完整拆分此合并区域
            delete newGrid[r][c].rowSpan
            delete newGrid[r][c].colSpan
            for (let sr = r; sr <= endR; sr++) {
              for (let sc = c; sc <= endC; sc++) {
                if (sr === r && sc === c) continue
                if (newGrid[sr]?.[sc]) delete newGrid[sr][sc].mergeHidden
              }
            }
          }
        }
      }

      // 第二步：清除选区内所有单元格的旧状态（保险）
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          if (newGrid[r]?.[c]) {
            delete newGrid[r][c].rowSpan
            delete newGrid[r][c].colSpan
            delete newGrid[r][c].mergeHidden
          }
        }
      }

      // 第三步：设置新的合并
      newGrid[minRow][minCol].rowSpan = maxRow - minRow + 1
      newGrid[minRow][minCol].colSpan = maxCol - minCol + 1
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          if (r === minRow && c === minCol) continue
          if (!newGrid[r][c]) newGrid[r][c] = { value: '' }
          newGrid[r][c].mergeHidden = true
        }
      }

      return newGrid
    })
  }, [selection])

  const unmergeCells = useCallback(() => {
    if (!selection) return
    pushUndo()
    const selMinRow = Math.min(selection.start.row, selection.end.row)
    const selMaxRow = Math.max(selection.start.row, selection.end.row)
    const selMinCol = Math.min(selection.start.col, selection.end.col)
    const selMaxCol = Math.max(selection.start.col, selection.end.col)
    const isSingleCell = selMinRow === selMaxRow && selMinCol === selMaxCol

    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))

      // 收集需要拆分的合并区域
      const toSplit: Array<{ r: number; c: number; endR: number; endC: number }> = []
      for (let r = selMinRow; r <= selMaxRow; r++) {
        for (let c = selMinCol; c <= selMaxCol; c++) {
          const cell = newGrid[r][c]
          if (!cell?.rowSpan && !cell?.colSpan) continue
          // 只处理合并区域的左上角（非 mergeHidden 的 owner）
          if (cell.mergeHidden) continue
          const endR = r + (cell.rowSpan || 1) - 1
          const endC = c + (cell.colSpan || 1) - 1

          if (isSingleCell) {
            // 单单元格选区：允许拆分该单元格的合并（用户明确点击了 owner cell）
            toSplit.push({ r, c, endR, endC })
          } else {
            // 多单元格选区：只允许拆分左上角与选区左上角重合的合并区域
            // 这样用户必须从合并区域的左上角开始拖拽选区，才能拆分它
            // 防止从下方拖拽时意外包含上方大合并导致误拆分
            if (r === selMinRow && c === selMinCol && endR <= selMaxRow && endC <= selMaxCol) {
              toSplit.push({ r, c, endR, endC })
            }
          }
        }
      }

      for (const { r, c, endR, endC } of toSplit) {
        const cell = newGrid[r][c]
        // 保留 owner 样式
        const ownerStyle: Record<string, any> = {}
        for (const key of Object.keys(cell)) {
          if (!['rowSpan', 'colSpan', 'value', 'mergeHidden'].includes(key)) {
            ownerStyle[key] = (cell as any)[key]
          }
        }

        // 清除合并状态
        delete cell.rowSpan
        delete cell.colSpan
        delete (cell as any).mergeHidden
        // 子单元格：清空内容，保留样式
        for (let sr = r; sr <= endR; sr++) {
          for (let sc = c; sc <= endC; sc++) {
            if (sr === r && sc === c) continue
            if (newGrid[sr]?.[sc]) {
              newGrid[sr][sc] = { value: '', ...ownerStyle }
            }
          }
        }
      }

      return newGrid
    })
  }, [selection])

  /* ---- 边框 ---- */

  const setAllBorders = useCallback((borderStyle: string) => {
    if (!selection) return
    pushUndo()
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
  }, [selection, pushUndo])

  const clearAllBorders = useCallback(() => {
    if (!selection) return
    pushUndo()
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
  }

  const handleCellMouseDown = (row: number, col: number) => {
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
    // Ctrl+S 保存
    if (e.ctrlKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault()
      handleSave()
      return
    }
    // Ctrl+Z 撤销
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault()
      undo()
      return
    }
    // Ctrl+A 全选
    if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      if (grid.length > 0 && grid[0].length > 0) {
        setSelection({
          start: { row: 0, col: 0 },
          end: { row: grid.length - 1, col: grid[0].length - 1 },
        })
        setActiveCell({ row: 0, col: 0 })
      }
      return
    }
    // Ctrl+C 复制
    if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault()
      if (!selection) return
      const minRow = Math.min(selection.start.row, selection.end.row)
      const maxRow = Math.max(selection.start.row, selection.end.row)
      const minCol = Math.min(selection.start.col, selection.end.col)
      const maxCol = Math.max(selection.start.col, selection.end.col)
      const copied: CellData[][] = []
      for (let r = minRow; r <= maxRow; r++) {
        const row: CellData[] = []
        for (let c = minCol; c <= maxCol; c++) {
          row.push({ ...getCell(r, c) })
        }
        copied.push(row)
      }
      setClipboard(copied)
      return
    }
    // Ctrl+V 粘贴
    if (e.ctrlKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault()
      if (!clipboard || !activeCell) return
      pushUndo()
      const clipRows = clipboard.length
      const clipCols = clipboard[0]?.length || 0
      setGrid(prev => {
        const newGrid = prev.map(r => r.map(c => ({ ...c })))
        for (let r = 0; r < clipRows; r++) {
          const targetRow = activeCell.row + r
          if (targetRow >= newGrid.length) continue
          for (let c = 0; c < clipCols; c++) {
            const targetCol = activeCell.col + c
            if (targetCol >= newGrid[targetRow].length) continue
            const src = clipboard[r][c]
            newGrid[targetRow][targetCol] = {
              ...newGrid[targetRow][targetCol],
              value: src.value,
              bold: src.bold,
              italic: src.italic,
              underline: src.underline,
              align: src.align,
              verticalAlign: src.verticalAlign,
              bgColor: src.bgColor,
              textColor: src.textColor,
              fontSize: src.fontSize,
              wrapText: src.wrapText,
              textOrientation: src.textOrientation,
              borderTop: src.borderTop,
              borderBottom: src.borderBottom,
              borderLeft: src.borderLeft,
              borderRight: src.borderRight,
            }
          }
        }
        return newGrid
      })
      return
    }
    // Delete 清除内容
    if (e.key === 'Delete') {
      e.preventDefault()
      if (!selection) return
      pushUndo()
      setGrid(prev => {
        const newGrid = prev.map(r => r.map(c => ({ ...c })))
        for (let r = selection.start.row; r <= selection.end.row; r++) {
          for (let c = selection.start.col; c <= selection.end.col; c++) {
            if (newGrid[r]?.[c]) {
              newGrid[r][c].value = ''
              delete newGrid[r][c].formula
            }
          }
        }
        return newGrid
      })
      return
    }

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
    setImporting(true)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)
      const ws = workbook.worksheets[0]
      if (!ws) { setImporting(false); return }

      const MAX_IMPORT_ROWS = 50
      const MAX_IMPORT_COLS = 15

      const newGrid: CellData[][] = []
      const newRowHeights: number[] = []
      const newColWidths: number[] = []

      // 列宽（限制列数）
      if (ws.columns) {
        ws.columns.slice(0, MAX_IMPORT_COLS).forEach(col => {
          newColWidths.push(col.width ? col.width * 7 : 100)
        })
      }
      if (newColWidths.length === 0) {
        for (let i = 0; i < MAX_IMPORT_COLS; i++) newColWidths.push(100)
      }

      // 行数据（限制行数，跳过全空行）
      ws.eachRow((row, _rowNum) => {
        if (newGrid.length >= MAX_IMPORT_ROWS) return
        const cells: CellData[] = []
        const maxCol = Math.min(
          Math.max(row.cellCount, ws.columns?.length || 0),
          MAX_IMPORT_COLS
        )
        let hasContent = false

        for (let i = 1; i <= maxCol; i++) {
          const cell = row.getCell(i)
          let cellValue = ''
          if (cell.value !== null && cell.value !== undefined) {
            if (typeof cell.value === 'object') {
              cellValue = String((cell.value as any).text ?? (cell.value as any).richText ?? '')
            } else {
              cellValue = String(cell.value)
            }
          }
          if (cellValue.trim()) hasContent = true
          const cellData: CellData = { value: cellValue }
          try {
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
          } catch {}
          cells.push(cellData)
        }
        // 补齐到 maxCol
        while (cells.length < maxCol) cells.push({ value: '' })
        newGrid.push(cells)
        newRowHeights.push(24)
      })

      // 如果一行数据都没有，至少保留一行
      if (newGrid.length === 0) {
        const emptyRow: CellData[] = Array.from({ length: newColWidths.length }, () => ({ value: '' }))
        newGrid.push(emptyRow)
        newRowHeights.push(24)
      }

      // 合并单元格
      if (ws.model?.merges) {
        for (const merge of ws.model.merges as string[]) {
          const [startRef, endRef] = merge.split(':')
          if (!startRef || !endRef) continue
          const startCell = ws.getCell(startRef) as any
          const endCell = ws.getCell(endRef) as any
          const minRow = (startCell.row as number) - 1, maxRow = (endCell.row as number) - 1
          const minCol = (startCell.col as number) - 1, maxCol = (endCell.col as number) - 1
          if (minRow >= newGrid.length || minCol >= newColWidths.length) continue
          if (newGrid[minRow]?.[minCol]) {
            newGrid[minRow][minCol].rowSpan = Math.min(maxRow - minRow + 1, newGrid.length - minRow)
            newGrid[minRow][minCol].colSpan = Math.min(maxCol - minCol + 1, newColWidths.length - minCol)
          }
          for (let r = minRow; r <= Math.min(maxRow, newGrid.length - 1); r++) {
            for (let c = minCol; c <= Math.min(maxCol, newColWidths.length - 1); c++) {
              if (r === minRow && c === minCol) continue
              if (newGrid[r]?.[c]) newGrid[r][c].mergeHidden = true
            }
          }
        }
      }

      // 确保所有行长度与列宽一致
      const targetCols = newColWidths.length
      for (const row of newGrid) {
        while (row.length < targetCols) row.push({ value: '' })
      }

      // 先关闭对话框，再更新状态（解耦渲染）
      setImportDialogOpen(false)
      // 用 setTimeout 把状态更新放到下一个事件循环，让 UI 先响应
      setTimeout(() => {
        // 归一化 mergeHidden 标记，确保合并区域一致性
        setGrid(normalizedGrid(newGrid))
        setColWidths(newColWidths)
        setRowHeights(newRowHeights)
        setImporting(false)
        // 重置 file input
        if (fileInputRef.current) fileInputRef.current.value = ''
      }, 50)
    } catch (err) {
      console.error('Import error:', err)
      alert('导入 Excel 失败: ' + (err instanceof Error ? err.message : String(err)))
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
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

  const getSelectionLabel = (): string => {
    if (!selection) return ''
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)
    const startColLabel = getColLabel(minCol)
    const endColLabel = getColLabel(maxCol)
    if (minRow === maxRow && minCol === maxCol) {
      return `选中: ${startColLabel}${minRow + 1}`
    }
    return `选中: ${startColLabel}${minRow + 1}:${endColLabel}${maxRow + 1} (${maxRow - minRow + 1}×${maxCol - minCol + 1})`
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
          {selection && (
            <Badge variant="default" className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-100">
              {getSelectionLabel()}
            </Badge>
          )}
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
              title="撤销 (Ctrl+Z)"
              onClick={undo}
              disabled={!canUndo}>
              <Undo className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />
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
            {/* 选区范围显示 */}
            {selection && (
              <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-1">
                {getSelectionLabel()}
              </span>
            )}
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

            <Button variant="ghost" size="sm" className="w-8 h-8"
              title="横排文字"
              onClick={() => setRangeStyle({ textOrientation: 'horizontal' })}>
              <span className="text-xs font-bold">T</span>
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              title="竖排文字"
              onClick={() => setRangeStyle({ textOrientation: 'vertical' })}>
              <span className="text-xs font-bold" style={{ writingMode: 'vertical-rl' }}>T</span>
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 多选字段排列方向 */}
            <Button variant="ghost" size="sm" className="w-8 h-8"
              title="多选纵向排列"
              onClick={() => setRangeStyle({ layoutDirection: 'vertical' })}>
              <span className="text-xs font-bold">⊣<br/>⊣</span>
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              title="多选横向排列"
              onClick={() => setRangeStyle({ layoutDirection: 'horizontal' })}>
              <span className="text-xs font-bold">⊣ ⊣</span>
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

        {/* 右侧表格编辑区 - 单层 CSS Grid，彻底避免 table rowSpan/colSpan 列错位 */}
        <div className="col-span-10 overflow-auto border rounded-lg bg-white"
          onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
          <div className="grid" style={{ gridTemplateColumns: `36px ${colWidths.map(w => `${w}px`).join(' ')}` }}>
            {/* 列头 */}
            <div className="sticky top-0 z-10 h-6 bg-gray-100 border border-gray-300 text-[10px] text-gray-500 font-normal text-center flex items-center justify-center"
              style={{ gridColumn: 1, gridRow: 1 }}>#</div>
            {colWidths.map((w, i) => (
              <div key={`ch-${i}`}
                className="sticky top-0 z-10 h-6 bg-gray-100 border border-gray-300 text-[10px] text-gray-500 font-normal text-center relative flex items-center justify-center"
                style={{ gridColumn: i + 2, gridRow: 1 }}>
                {getColLabel(i)}
                <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400 z-20"
                  onMouseDown={e => handleColResizeStart(e, i)} />
              </div>
            ))}

            {/* 数据单元格：所有单元格平铺在同一 grid 中，通过 grid-column/grid-row 精确定位 */}
            {grid.flatMap((row, ri) => {
              const items: React.ReactNode[] = []
              // 行号
              items.push(
                <div key={`rh-${ri}`}
                  className="bg-gray-50 border border-gray-300 text-[10px] text-gray-500 text-center select-none flex items-center justify-center"
                  style={{ gridColumn: 1, gridRow: ri + 2, minHeight: `${rowHeights[ri] || 24}px` }}>
                  {ri + 1}
                </div>
              )
              // 数据
              row.forEach((cell, ci) => {
                const cellData = cell || { value: '' }
                if (cellData.mergeHidden) return
                const isSelected = isCellSelected(ri, ci)
                const isActive = isCellActive(ri, ci)

                const gridColumn = cellData.colSpan ? `${ci + 2} / span ${cellData.colSpan}` : ci + 2
                const gridRow = cellData.rowSpan ? `${ri + 2} / span ${cellData.rowSpan}` : ri + 2

                const style: React.CSSProperties = {
                  gridColumn,
                  gridRow,
                  minHeight: `${rowHeights[ri] || 24}px`,
                  fontSize: cellData.fontSize || 11,
                  fontWeight: cellData.bold ? 'bold' : undefined,
                  fontStyle: cellData.italic ? 'italic' : undefined,
                  textDecoration: cellData.underline ? 'underline' : undefined,
                  textAlign: cellData.align || 'left',
                  verticalAlign: cellData.verticalAlign || 'middle',
                  backgroundColor: cellData.bgColor || undefined,
                  color: cellData.textColor || undefined,
                  whiteSpace: cellData.wrapText ? 'normal' : 'nowrap',
                  writingMode: cellData.textOrientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
                }

                items.push(
                  <div key={`${ri}-${ci}`}
                    className={`border border-gray-300 p-1 relative cursor-pointer select-none flex items-center
                      ${isActive ? 'ring-2 ring-blue-500 ring-inset' : ''}
                      ${isSelected ? 'bg-blue-50' : ''}`}
                    style={style}
                    onClick={() => handleCellClick(ri, ci)}
                    onMouseDown={() => handleCellMouseDown(ri, ci)}
                    onMouseEnter={() => handleCellMouseEnter(ri, ci)}>
                    {isActive ? (
                      <input
                        className="w-full h-full bg-transparent border-none outline-none text-[inherit] font-[inherit] p-0 m-0"
                        value={typeof cellData.value === 'string' ? cellData.value : String(cellData.value ?? '')}
                        onChange={e => setCell(ri, ci, { value: e.target.value })}
                        onKeyDown={handleKeyDown}
                        autoFocus
                      />
                    ) : (
                      <CellDisplay value={typeof cellData.value === 'string' ? cellData.value : String(cellData.value ?? '')} fields={fields} />
                    )}
                  </div>
                )
              })
              return items
            })}
          </div>
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
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}>
              {importing ? (
                <><Loader2 className="w-6 h-6 mr-2 animate-spin text-gray-400" /><span className="text-gray-500">正在导入...</span></>
              ) : (
                <><Upload className="w-6 h-6 mr-2 text-gray-400" /><span className="text-gray-500">点击选择 Excel 文件</span></>
              )}
            </Button>
            <p className="text-xs text-gray-400 mt-2 text-center">最多导入前 50 行 × 15 列</p>
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
                            writingMode: cell.textOrientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
                          }}>
                          <CellDisplay value={typeof cell.value === 'string' ? cell.value : String(cell.value ?? '')} fields={fields} />
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