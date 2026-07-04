"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
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
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Type,
  Plus,
  Trash2,
  Database,
  ChevronDown,
  Merge,
  Unlink,
  Grid3x3,
  Minus,
  AlignJustify,
  ChevronUp,
  ArrowUpDown,
} from 'lucide-react'
import { ExportTemplate, DataTable, TableField } from '@prisma/client'
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
}

interface RowConfig {
  height: number
}

interface ColConfig {
  width: number
}

interface ExcelTemplateDesignerProps {
  template: TemplateWithTable
}

const DEFAULT_ROWS = 30
const DEFAULT_COLS = 15
const FIELD_PATTERN = '\\{\\{[^}]+\\}\\}'

function getColLabel(index: number) {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

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
    <div className="truncate whitespace-nowrap">
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

export function ExcelTemplateDesigner({ template }: ExcelTemplateDesignerProps) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  const [saving, setSaving] = useState(false)
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const [selection, setSelection] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null)
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSelecting = useRef(false)

  const table = template.table
  const allFields = table.fields

  const emptyCell = (): CellData => ({ value: '' })

  const initGrid = useCallback((): CellData[][] => {
    const cfg = template.config as any
    if (cfg && cfg.grid) {
      return cfg.grid
    }
    const grid: CellData[][] = []
    for (let i = 0; i < DEFAULT_ROWS; i++) {
      const row: CellData[] = []
      for (let j = 0; j < DEFAULT_COLS; j++) {
        row.push(emptyCell())
      }
      grid.push(row)
    }
    return grid
  }, [template.config])

  const [grid, setGrid] = useState<CellData[][]>(initGrid)

  const initRowHeights = useCallback((): number[] => {
    const cfg = template.config as any
    if (cfg && cfg.rowHeights) {
      return cfg.rowHeights
    }
    return Array.from({ length: DEFAULT_ROWS }, () => 24)
  }, [template.config])

  const initColWidths = useCallback((): number[] => {
    const cfg = template.config as any
    if (cfg && cfg.colWidths) {
      return cfg.colWidths
    }
    return Array.from({ length: DEFAULT_COLS }, () => 100)
  }, [template.config])

  const [rowHeights, setRowHeights] = useState<number[]>(initRowHeights)
  const [colWidths, setColWidths] = useState<number[]>(initColWidths)

  const getCell = (row: number, col: number): CellData => {
    return grid[row]?.[col] || emptyCell()
  }

  const setCell = (row: number, col: number, data: Partial<CellData>) => {
    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))
      newGrid[row] = newGrid[row] || []
      newGrid[row][col] = { ...newGrid[row][col], ...data }
      return newGrid
    })
  }

  const setRangeStyle = (style: Partial<CellData>) => {
    if (!selection) return
    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))
      for (let r = selection.start.row; r <= selection.end.row; r++) {
        for (let c = selection.start.col; c <= selection.end.col; c++) {
          if (newGrid[r] && newGrid[r][c]) {
            newGrid[r][c] = { ...newGrid[r][c], ...style }
          }
        }
      }
      return newGrid
    })
  }

  const mergeCells = () => {
    if (!selection) return
    const { start, end } = selection
    if (start.row === end.row && start.col === end.col) return

    const rowSpan = end.row - start.row + 1
    const colSpan = end.col - start.col + 1

    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))
      const topLeftCell = { ...newGrid[start.row][start.col] }
      topLeftCell.rowSpan = rowSpan
      topLeftCell.colSpan = colSpan
      newGrid[start.row][start.col] = topLeftCell

      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          if (r === start.row && c === start.col) continue
          newGrid[r][c] = { ...newGrid[r][c], mergeHidden: true }
        }
      }
      return newGrid
    })
  }

  const unmergeCells = () => {
    if (!selection) return
    const { start, end } = selection

    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))
      for (let r = start.row; r <= end.row; r++) {
        for (let c = start.col; c <= end.col; c++) {
          if (newGrid[r]?.[c]) {
            delete newGrid[r][c].rowSpan
            delete newGrid[r][c].colSpan
            delete newGrid[r][c].mergeHidden
          }
        }
      }
      return newGrid
    })
  }

  const setAllBorders = (borderStyle: string) => {
    if (!selection) return
    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))
      for (let r = selection.start.row; r <= selection.end.row; r++) {
        for (let c = selection.start.col; c <= selection.end.col; c++) {
          if (newGrid[r] && newGrid[r][c]) {
            newGrid[r][c] = {
              ...newGrid[r][c],
              borderTop: borderStyle,
              borderBottom: borderStyle,
              borderLeft: borderStyle,
              borderRight: borderStyle,
            }
          }
        }
      }
      return newGrid
    })
  }

  const clearAllBorders = () => {
    if (!selection) return
    setGrid(prev => {
      const newGrid = prev.map(r => r.map(c => ({ ...c })))
      for (let r = selection.start.row; r <= selection.end.row; r++) {
        for (let c = selection.start.col; c <= selection.end.col; c++) {
          if (newGrid[r] && newGrid[r][c]) {
            delete newGrid[r][c].borderTop
            delete newGrid[r][c].borderBottom
            delete newGrid[r][c].borderLeft
            delete newGrid[r][c].borderRight
          }
        }
      }
      return newGrid
    })
  }

  const setRowHeight = (row: number, height: number) => {
    setRowHeights(prev => {
      const newHeights = [...prev]
      newHeights[row] = height
      return newHeights
    })
  }

  const setColWidth = (col: number, width: number) => {
    setColWidths(prev => {
      const newWidths = [...prev]
      newWidths[col] = width
      return newWidths
    })
  }

  const addRow = () => {
    setGrid(prev => {
      const newGrid = [...prev]
      const cols = prev[0]?.length || DEFAULT_COLS
      newGrid.push(Array.from({ length: cols }, () => emptyCell()))
      return newGrid
    })
    setRowHeights(prev => [...prev, 24])
  }

  const addCol = () => {
    setGrid(prev => {
      return prev.map(row => [...row, emptyCell()])
    })
    setColWidths(prev => [...prev, 100])
  }

  const handleCellClick = (row: number, col: number) => {
    setActiveCell({ row, col })
    setSelection({ start: { row, col }, end: { row, col } })
    isSelecting.current = true
  }

  const handleCellMouseEnter = (row: number, col: number) => {
    if (!isSelecting.current || !activeCell) return
    setSelection({
      start: { row: Math.min(activeCell.row, row), col: Math.min(activeCell.col, col) },
      end: { row: Math.max(activeCell.row, row), col: Math.max(activeCell.col, col) },
    })
  }

  const handleMouseUp = () => {
    isSelecting.current = false
  }

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  const handleCellEdit = (row: number, col: number, value: string) => {
    setCell(row, col, { value })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!activeCell) return
    if (e.key === 'ArrowUp' && activeCell.row > 0) {
      const newRow = activeCell.row - 1
      setActiveCell({ row: newRow, col: activeCell.col })
      setSelection({ start: { row: newRow, col: activeCell.col }, end: { row: newRow, col: activeCell.col } })
    } else if (e.key === 'ArrowDown' && activeCell.row < grid.length - 1) {
      const newRow = activeCell.row + 1
      setActiveCell({ row: newRow, col: activeCell.col })
      setSelection({ start: { row: newRow, col: activeCell.col }, end: { row: newRow, col: activeCell.col } })
    } else if (e.key === 'ArrowLeft' && activeCell.col > 0) {
      const newCol = activeCell.col - 1
      setActiveCell({ row: activeCell.row, col: newCol })
      setSelection({ start: { row: activeCell.row, col: newCol }, end: { row: activeCell.row, col: newCol } })
    } else if (e.key === 'ArrowRight' && activeCell.col < (grid[0]?.length || 0) - 1) {
      const newCol = activeCell.col + 1
      setActiveCell({ row: activeCell.row, col: newCol })
      setSelection({ start: { row: activeCell.row, col: newCol }, end: { row: activeCell.row, col: newCol } })
    }
  }

  const deleteRow = () => {
    if (!selection) return
    const startRow = selection.start.row
    const endRow = selection.end.row
    setGrid(prev => prev.filter((_, i) => i < startRow || i > endRow))
    setRowHeights(prev => prev.filter((_, i) => i < startRow || i > endRow))
    setActiveCell(null)
    setSelection(null)
  }

  const deleteCol = () => {
    if (!selection) return
    const startCol = selection.start.col
    const endCol = selection.end.col
    setGrid(prev => prev.map(row => row.filter((_, i) => i < startCol || i > endCol)))
    setColWidths(prev => prev.filter((_, i) => i < startCol || i > endCol))
    setActiveCell(null)
    setSelection(null)
  }

  const insertField = (fieldName: string) => {
    if (!activeCell) return
    const currentValue = getCell(activeCell.row, activeCell.col).value
    setCell(activeCell.row, activeCell.col, {
      value: currentValue + '{{' + fieldName + '}}',
    })
    setFieldDialogOpen(false)
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const arrayBuffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(arrayBuffer as ArrayBuffer)
      
      const worksheet = workbook.worksheets[0]
      if (!worksheet) {
        alert('Excel文件中没有工作表')
        return
      }

      const rowCount = worksheet.rowCount || 30
      const colCount = worksheet.columnCount || 15
      const newGrid: CellData[][] = []
      const newRowHeights: number[] = []
      const newColWidths: number[] = []

      for (let r = 1; r <= rowCount; r++) {
        const row: CellData[] = []
        const rowData = worksheet.getRow(r)
        newRowHeights.push(rowData.height || 24)
        for (let c = 1; c <= colCount; c++) {
          const cellData = rowData.getCell(c)
          const cell: CellData = {
            value: cellData.value?.toString() || '',
            bold: cellData.font?.bold,
            italic: cellData.font?.italic,
            underline: cellData.font?.underline ? true : false,
            fontSize: cellData.font?.size,
            bgColor: (cellData.fill as any)?.fgColor?.argb ? '#' + (cellData.fill as any).fgColor.argb.slice(2) : undefined,
            textColor: cellData.font?.color?.argb ? '#' + cellData.font.color.argb.slice(2) : undefined,
            align: cellData.alignment?.horizontal as any,
            verticalAlign: cellData.alignment?.vertical as any,
            wrapText: cellData.alignment?.wrapText,
          }
          row.push(cell)
        }
        newGrid.push(row)
      }

      for (let c = 1; c <= colCount; c++) {
        const colData = worksheet.getColumn(c)
        newColWidths.push((colData.width || 10) * 7)
      }

      const merges = (worksheet as any).model?.merges || []
      merges.forEach((merge: any) => {
        const top = (typeof merge === 'string') ? parseInt(merge.split(':')[0].replace(/\D/g, '')) - 1 : merge.top - 1
        const left = (typeof merge === 'string') ? merge.split(':')[0].replace(/\d/g, '').toUpperCase().charCodeAt(0) - 65 : merge.left - 1
        const bottom = (typeof merge === 'string') ? parseInt(merge.split(':')[1].replace(/\D/g, '')) - 1 : merge.bottom - 1
        const right = (typeof merge === 'string') ? merge.split(':')[1].replace(/\d/g, '').toUpperCase().charCodeAt(0) - 65 : merge.right - 1
        if (top >= 0 && left >= 0 && bottom < rowCount && right < colCount) {
          newGrid[top][left].rowSpan = bottom - top + 1
          newGrid[top][left].colSpan = right - left + 1
          for (let r = top; r <= bottom; r++) {
            for (let c = left; c <= right; c++) {
              if (r === top && c === left) continue
              newGrid[r][c].mergeHidden = true
            }
          }
        }
      })

      setGrid(newGrid)
      setRowHeights(newRowHeights)
      setColWidths(newColWidths)
      setImportDialogOpen(false)
      alert('导入成功！')
    } catch (err) {
      console.error('Import error:', err)
      alert('导入失败：' + (err as Error).message)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/export-templates/' + template.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          config: {
            grid,
            rowHeights,
            colWidths,
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

  const activeCellStyle = activeCell ? getCell(activeCell.row, activeCell.col) : emptyCell()

  const isCellSelected = (row: number, col: number) => {
    if (!selection) return false
    return row >= selection.start.row && row <= selection.end.row &&
           col >= selection.start.col && col <= selection.end.col
  }

  const isCellActive = (row: number, col: number) => {
    return activeCell?.row === row && activeCell?.col === col
  }

  const countFields = () => {
    let count = 0
    const regex = new RegExp(FIELD_PATTERN, 'g')
    grid.forEach(row => {
      row.forEach(cell => {
        const matches = cell.value.match(regex)
        if (matches) count += matches.length
      })
    })
    return count
  }

  const fieldCount = countFields()

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown} tabIndex={0}>
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
              {table.label} · {fieldCount}个字段绑定
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
          <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Eye className="w-4 h-4 mr-2" />
                预览效果
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>数据填充预览</DialogTitle>
                <DialogDescription>
                  查看模板填充示例数据后的效果
                </DialogDescription>
              </DialogHeader>
              <div className="border rounded-lg overflow-auto">
                <table className="text-xs w-full border-collapse">
                  <tbody>
                    {grid.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="border border-gray-200 px-2 py-1 min-w-[80px]"
                            style={{
                              fontWeight: cell.bold ? 'bold' : 'normal',
                              fontStyle: cell.italic ? 'italic' : 'normal',
                              textDecoration: cell.underline ? 'underline' : 'none',
                              textAlign: cell.align || 'left',
                              backgroundColor: cell.bgColor,
                              color: cell.textColor,
                              fontSize: cell.fontSize ? cell.fontSize + 'px' : undefined,
                            }}
                          >
                            {cell.value || '\u00A0'}
                          </td>
                        ))}
                      </tr>
                    ))}
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

      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="加粗"
                onClick={() => setRangeStyle({ bold: !activeCellStyle.bold })}
              >
                <Bold className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="斜体"
                onClick={() => setRangeStyle({ italic: !activeCellStyle.italic })}
              >
                <Italic className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="下划线"
                onClick={() => setRangeStyle({ underline: !activeCellStyle.underline })}
              >
                <Underline className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="左对齐"
                onClick={() => setRangeStyle({ align: 'left' })}
              >
                <AlignLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="居中"
                onClick={() => setRangeStyle({ align: 'center' })}
              >
                <AlignCenter className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="右对齐"
                onClick={() => setRangeStyle({ align: 'right' })}
              >
                <AlignRight className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Palette className="w-4 h-4 text-gray-400" />
                <input
                  type="color"
                  value={activeCellStyle.bgColor || '#ffffff'}
                  onChange={(e) => setRangeStyle({ bgColor: e.target.value })}
                  className="w-6 h-6 cursor-pointer border rounded"
                  title="背景色"
                />
              </div>
              <div className="flex items-center gap-1">
                <Type className="w-4 h-4 text-gray-400" />
                <input
                  type="color"
                  value={activeCellStyle.textColor || '#000000'}
                  onChange={(e) => setRangeStyle({ textColor: e.target.value })}
                  className="w-6 h-6 cursor-pointer border rounded"
                  title="字体颜色"
                />
              </div>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Select
                value={activeCellStyle.fontSize?.toString() || '11'}
                onValueChange={(v) => setRangeStyle({ fontSize: parseInt(v) })}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="9">9px</SelectItem>
                  <SelectItem value="10">10px</SelectItem>
                  <SelectItem value="11">11px</SelectItem>
                  <SelectItem value="12">12px</SelectItem>
                  <SelectItem value="14">14px</SelectItem>
                  <SelectItem value="16">16px</SelectItem>
                  <SelectItem value="18">18px</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="合并单元格"
                onClick={mergeCells}
                disabled={!selection || (selection.start.row === selection.end.row && selection.start.col === selection.end.col)}
              >
                <Merge className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="取消合并"
                onClick={unmergeCells}
                disabled={!selection}
              >
                <Unlink className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="全部边框"
                onClick={() => setAllBorders('1px solid #d1d5db')}
                disabled={!selection}
              >
                <Grid3x3 className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="清除边框"
                onClick={clearAllBorders}
                disabled={!selection}
              >
                <Minus className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="自动换行"
                onClick={() => setRangeStyle({ wrapText: !activeCellStyle.wrapText })}
              >
                <AlignJustify className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="顶端对齐"
                onClick={() => setRangeStyle({ verticalAlign: 'top' })}
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="垂直居中"
                onClick={() => setRangeStyle({ verticalAlign: 'middle' })}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="底端对齐"
                onClick={() => setRangeStyle({ verticalAlign: 'bottom' })}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8">
                    <Database className="w-4 h-4 mr-1" />
                    插入字段
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>插入数据库字段</DialogTitle>
                    <DialogDescription>
                      选择要插入到当前单元格的字段
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-2 py-4 max-h-80 overflow-y-auto">
                    {allFields.map(field => (
                      <Button
                        key={field.name}
                        variant="outline"
                        className="justify-start"
                        onClick={() => insertField(field.name)}
                      >
                        <span className="truncate">{field.label}</span>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {field.type}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">取消</Button>
                    </DialogClose>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" title="添加行" onClick={addRow}>
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" title="添加列" onClick={addCol}>
                <ChevronDown className="w-4 h-4 rotate-[-90deg]" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500"
                title="删除行"
                onClick={deleteRow}
                disabled={!selection}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-2">
          <Card className="h-full">
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="w-4 h-4" />
                可用字段
              </CardTitle>
              <CardDescription className="text-xs">
                点击单元格后插入字段
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                {allFields.map(field => (
                  <button
                    key={field.name}
                    onClick={() => {
                      if (activeCell) {
                        insertField(field.name)
                      }
                    }}
                    className={
                      'w-full text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 transition-colors ' +
                      (activeCell ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')
                    }
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
            <div
              className="overflow-auto max-h-[70vh]"
              onMouseUp={handleMouseUp}
            >
              <table className="border-collapse text-xs" style={{ tableLayout: 'fixed' }}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-10 h-6 bg-gray-100 border border-gray-300 text-gray-500 font-normal text-xs sticky left-0 z-20">
                    </th>
                    {grid[0]?.map((_, cIdx) => (
                      <th
                        key={cIdx}
                        className="h-6 bg-gray-100 border border-gray-300 text-gray-600 font-medium text-xs"
                        style={{ width: colWidths[cIdx] || 100, minWidth: colWidths[cIdx] || 100 }}
                      >
                        {getColLabel(cIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, rIdx) => (
                    <tr key={rIdx} style={{ height: rowHeights[rIdx] || 24 }}>
                      <td 
                        className="w-10 bg-gray-100 border border-gray-300 text-gray-500 font-normal text-xs text-center sticky left-0 z-10 align-middle"
                        style={{ height: rowHeights[rIdx] || 24 }}
                      >
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => {
                        if (cell.mergeHidden) return null
                        const selected = isCellSelected(rIdx, cIdx)
                        const active = isCellActive(rIdx, cIdx)
                        const rowSpan = cell.rowSpan || 1
                        const colSpan = cell.colSpan || 1
                        return (
                          <td
                            key={cIdx}
                            rowSpan={rowSpan}
                            colSpan={colSpan}
                            className={
                              'border px-1 transition-colors overflow-hidden align-middle ' +
                              (active
                                ? 'border-blue-500 border-2'
                                : selected
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-gray-200')
                            }
                            style={{
                              height: rowHeights[rIdx] || 24,
                              fontWeight: cell.bold ? 'bold' : 'normal',
                              fontStyle: cell.italic ? 'italic' : 'normal',
                              textDecoration: cell.underline ? 'underline' : 'none',
                              textAlign: cell.align || 'left',
                              verticalAlign: cell.verticalAlign || 'middle',
                              backgroundColor: cell.bgColor || (selected ? '#EFF6FF' : 'white'),
                              color: cell.textColor,
                              fontSize: cell.fontSize ? cell.fontSize + 'px' : '11px',
                              whiteSpace: cell.wrapText ? 'pre-wrap' : 'nowrap',
                              borderTop: cell.borderTop,
                              borderBottom: cell.borderBottom,
                              borderLeft: cell.borderLeft,
                              borderRight: cell.borderRight,
                            }}
                            onMouseDown={() => handleCellClick(rIdx, cIdx)}
                            onMouseEnter={() => handleCellMouseEnter(rIdx, cIdx)}
                          >
                            {active ? (
                              <input
                                autoFocus
                                value={cell.value}
                                onChange={(e) => handleCellEdit(rIdx, cIdx, e.target.value)}
                                onBlur={() => {}}
                                className="w-full h-full bg-transparent outline-none"
                                style={{ fontSize: 'inherit' }}
                              />
                            ) : (
                              <CellDisplay value={cell.value} fields={allFields} />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          
          <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
            <div>
              {grid.length} 行 × {grid[0]?.length || 0} 列
              {activeCell && (
                <span className="ml-2">
                  当前单元格: {getColLabel(activeCell.col)}{activeCell.row + 1}
                </span>
              )}
            </div>
            <div>
              <Badge variant="outline" className="text-xs">
                {fieldCount} 个字段绑定
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
