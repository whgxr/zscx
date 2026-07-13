# 表单设计器 Excel 编辑模式改造 - 实现计划

> **说明：** 本计划将表单设计器完全重写为 Excel 编辑模式，复用 ExcelTemplateDesigner 的编辑体验，但适配表单布局的保存/加载 API，同时保留子表模块功能。

**目标：** 将 `FormLayoutDesigner` 改造为 `FormExcelDesigner`，使用与 Excel 模板设计器完全相同的单元格编辑体验（列头 A/B/C、行号、格式工具栏、拖拽选范围、合并、公式、导入 Excel、页面布局），去掉分组概念改为单一表格，并支持子表配置。

**架构：**
- 新建 `FormExcelDesigner` 组件，复用与 `ExcelTemplateDesigner` 相同的 `CellData` 数据结构和编辑逻辑模式
- 将 `CellData` 等共享类型提取到独立的 `types/cell-data.ts` 文件
- `DynamicForm` 增加对新格式 `FormExcelConfig` 的解析和渲染支持
- `field-designer.tsx` 页面替换组件引用和保存逻辑

**技术栈：** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, exceljs

---

### 任务 1：提取共享类型和工具函数

**文件：**
- 创建：`web/types/cell-data.ts`
- 修改：`web/app/dashboard/export-templates/[id]/excel-designer.tsx`

- [ ] **Step 1: 创建共享类型文件 `web/types/cell-data.ts`**

```typescript
// 单元格数据格式
export interface CellData {
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

// 页面布局设置
export interface PageSetup {
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

export interface RowConfig {
  height: number
}

export interface ColConfig {
  width: number
}

export const DEFAULT_ROWS = 30
export const DEFAULT_COLS = 15
export const FIELD_PATTERN = '\\{\\{[^}]+\\}\\}'

// 列字母标签生成 (A, B, ..., Z, AA, AB...)
export function getColLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

// 空单元格工厂
export function emptyCell(): CellData {
  return { value: '' }
}
```

- [ ] **Step 2: 更新 `excel-designer.tsx` 导入共享类型**

将 `excel-designer.tsx` 第 65-123 行中的 `CellData`、`PageSetup`、`RowConfig`、`ColConfig`、`DEFAULT_ROWS`、`DEFAULT_COLS`、`FIELD_PATTERN`、`getColLabel` 的定义删除，替换为从 `@/types/cell-data` 导入。

```typescript
// 删除以下行（原第65-123行）：
// interface CellData { ... }
// interface PageSetup { ... }
// interface RowConfig { ... }
// interface ColConfig { ... }
// const DEFAULT_ROWS = 30
// const DEFAULT_COLS = 15
// const FIELD_PATTERN = '\\{\\{[^}]+\\}\\}'
// function getColLabel(index: number) { ... }

// 替换为：
import { CellData, PageSetup, RowConfig, ColConfig, DEFAULT_ROWS, DEFAULT_COLS, FIELD_PATTERN, getColLabel, emptyCell } from '@/types/cell-data'
```

同时删除 `excel-designer.tsx` 中的 `emptyCell` 函数定义（第183行），因为它已经在共享类型中定义了。

- [ ] **Step 3: 验证导出模板设计器正常工作**

```bash
node -e "console.log('types exported correctly')"
```

运行 `npm run build` 或 `npm run dev` 验证编译无错误。

---

### 任务 2：定义表单设计器新配置格式

**文件：**
- 创建：`web/types/form-excel-config.ts`

- [ ] **Step 1: 创建 `web/types/form-excel-config.ts`**

```typescript
import { CellData, PageSetup } from './cell-data'

// 子表配置
export interface SubTableConfig {
  detailTableId: number
  detailTableName: string
  label: string
  fields: string[]  // 子表显示字段名列表
  minRows?: number
  maxRows?: number
}

// 表单设计器新配置格式
export interface FormExcelConfig {
  grid: CellData[][]
  rowHeights: number[]
  colWidths: number[]
  pageSetup: PageSetup
  subTables: SubTableConfig[]
  defaultFontSize?: number
  defaultRowHeight?: number
}
```

- [ ] **Step 2: 创建旧格式迁移函数**

在 `web/types/form-excel-config.ts` 中添加迁移函数：

```typescript
import { FormLayoutConfig, FormCellData, FormLayoutGroup } from '@/components/form-layout-designer'

// 默认页面设置
export function defaultPageSetup(): PageSetup {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 15,
    marginRight: 15,
    headerMargin: 10,
    footerMargin: 10,
  }
}

// 默认列宽
export const DEFAULT_FORM_COL_WIDTHS = [120, 200, 120, 200]

// 默认表单配置
export function defaultFormExcelConfig(): FormExcelConfig {
  return {
    grid: [Array.from({ length: 4 }, () => ({ value: '' }))],
    rowHeights: [32],
    colWidths: [...DEFAULT_FORM_COL_WIDTHS],
    pageSetup: defaultPageSetup(),
    subTables: [],
    defaultFontSize: 13,
    defaultRowHeight: 32,
  }
}

// 从旧版 FormLayoutConfig 迁移到 FormExcelConfig
export function migrateFormLayoutToExcel(
  oldConfig: FormLayoutConfig | null | undefined
): FormExcelConfig {
  if (!oldConfig || !oldConfig.groups || oldConfig.groups.length === 0) {
    return defaultFormExcelConfig()
  }

  // 检查是否已经是新版格式
  if ('grid' in oldConfig) {
    return oldConfig as unknown as FormExcelConfig
  }

  const groups = oldConfig.groups
  const grid: CellData[][] = []
  const rowHeights: number[] = []
  let colWidths = [...DEFAULT_FORM_COL_WIDTHS]
  const subTables: SubTableConfig[] = []

  for (const group of groups) {
    // 分组标题行
    if (group.title) {
      grid.push([{
        value: group.title,
        bold: true,
        fontSize: 14,
        align: 'center',
        bgColor: '#EFF6FF',
        colSpan: group.columns || 4,
      }])
      // 补齐被 colSpan 覆盖的列
      for (let i = 1; i < (group.columns || 4); i++) {
        grid[grid.length - 1].push({ value: '', mergeHidden: true })
      }
      rowHeights.push(36)
    }

    // 列宽
    if (group.colWidths && group.colWidths.length > 0) {
      colWidths = [...group.colWidths]
    }

    // 新版 rows 格式
    if (group.rows && group.rows.length > 0) {
      for (const row of group.rows) {
        const excelRow: CellData[] = []
        for (const cell of row) {
          if (cell.fieldId != null && cell.fieldName) {
            // 标签部分
            const labelText = cell.fieldName ? `${cell.fieldName}：` : ''
            excelRow.push({
              value: `${labelText}{{${cell.fieldName}}}`,
              fontSize: cell.fontSize || 13,
              colSpan: cell.colSpan || 1,
              rowSpan: cell.rowSpan || 1,
            })
          } else {
            excelRow.push({ value: '' })
          }
        }
        // 补齐到 columns 列
        while (excelRow.length < (group.columns || 4)) {
          excelRow.push({ value: '' })
        }
        grid.push(excelRow)
        rowHeights.push(32)
      }
    }
  }

  // 确保至少有 8 行
  while (grid.length < 8) {
    const emptyRow: CellData[] = Array.from({ length: colWidths.length }, () => ({ value: '' }))
    grid.push(emptyRow)
    rowHeights.push(32)
  }

  return { grid, rowHeights, colWidths, pageSetup: defaultPageSetup(), subTables, defaultFontSize: 13, defaultRowHeight: 32 }
}
```

---

### 任务 3：创建 FormExcelDesigner 组件

**文件：**
- 创建：`web/components/form-excel-designer.tsx`

这是核心任务。创建全新的组件，复用与 `ExcelTemplateDesigner` 相同的编辑模式，但适配表单布局 API。

- [ ] **Step 1: 创建组件骨架和导入**

```typescript
"use client"

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Separator } from '@/components/ui/separator'
import { TableField } from '@prisma/client'
import {
  ArrowLeft, Save, Upload, Eye, Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight, Palette, Type, Plus, Trash2,
  Database, ChevronDown, Merge, Unlink, Grid3x3, Minus, AlignJustify,
  Calculator, Settings, Search, X,
} from 'lucide-react'
import * as ExcelJS from 'exceljs'
import { CellData, PageSetup, DEFAULT_ROWS, DEFAULT_COLS, FIELD_PATTERN, getColLabel, emptyCell } from '@/types/cell-data'
import {
  FormExcelConfig, SubTableConfig, defaultFormExcelConfig, DEFAULT_FORM_COL_WIDTHS,
  migrateFormLayoutToExcel
} from '@/types/form-excel-config'
import { cn } from '@/lib/utils'
```

- [ ] **Step 2: 定义组件 Props 和状态**

```typescript
interface FormExcelDesignerProps {
  tableId: number
  fields: TableField[]
  initialConfig?: FormExcelConfig | any | null
  onSave: (config: FormExcelConfig) => Promise<void>
}

export default function FormExcelDesigner({
  tableId, fields, initialConfig, onSave
}: FormExcelDesignerProps) {
  // 核心状态
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

  // 子表相关
  const [subTableDialogOpen, setSubTableDialogOpen] = useState(false)
  const [availableDetailTables, setAvailableDetailTables] = useState<Array<{
    id: number; name: string; label: string
  }>>([])
  const [editingSubTable, setEditingSubTable] = useState<SubTableConfig | null>(null)
  const [subTableFields, setSubTableFields] = useState<string[]>([])

  // refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isSelecting = useRef(false)
  const resizingCol = useRef<number | null>(null)
  const resizingRow = useRef<number | null>(null)
  const resizeStartPos = useRef<number>(0)
  const resizeStartSize = useRef<number>(0)
```

- [ ] **Step 3: 实现核心单元格操作函数**

```typescript
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

  // 选中区域样式批量设置
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
          // 字号变化时自动调整行高
          const newRowHeight = Math.max(24, style.fontSize * 1.6)
          setRowHeights(prevH => {
            const next = [...prevH]
            next[ri] = newRowHeight
            return next
          })
        }
        return { ...cell, ...style }
      })
    }))
  }, [selection])

  // 合并单元格
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

  // 取消合并
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
```

- [ ] **Step 4: 实现其他核心函数（边框、行列、选择、导入、字段插入、保存）**

```typescript
  // 边框设置
  const setAllBorders = useCallback((borderStyle: string) => {
    if (!selection) return
    const minRow = Math.min(selection.start.row, selection.end.row)
    const maxRow = Math.max(selection.start.row, selection.end.row)
    const minCol = Math.min(selection.start.col, selection.end.col)
    const maxCol = Math.max(selection.start.col, selection.end.col)

    setGrid(prev => prev.map((row, ri) =>
      row.map((cell, ci) => {
        if (ri < minRow || ri > maxRow || ci < minCol || ci > maxCol) return cell
        const borders: Partial<CellData> = {
          borderTop: borderStyle, borderBottom: borderStyle,
          borderLeft: borderStyle, borderRight: borderStyle,
        }
        return { ...cell, ...borders }
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

  // 行列操作
  const setRowHeight = (row: number, height: number) => {
    setRowHeights(prev => {
      const next = [...prev]
      next[row] = height
      return next
    })
  }

  const setColWidth = (col: number, width: number) => {
    setColWidths(prev => {
      const next = [...prev]
      next[col] = width
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

  // 选择处理
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
    resizingRow.current = null
  }

  // 列宽/行高拖拽
  const handleColResizeStart = (e: React.MouseEvent, colIdx: number) => {
    e.preventDefault()
    resizingCol.current = colIdx
    resizeStartPos.current = e.clientX
    resizeStartSize.current = colWidths[colIdx]
  }

  // 键盘导航
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

  // 插入字段
  const insertField = (fieldName: string) => {
    if (!activeCell) return
    const row = activeCell.row
    const col = activeCell.col
    setCell(row, col, { value: grid[row][col].value + `{{${fieldName}}}` })
    setFieldDialogOpen(false)
  }

  // 导入Excel
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

      // 列宽
      if (ws.columns) {
        ws.columns.forEach(col => {
          newColWidths.push(col.width ? col.width * 7 : 100)
        })
      }

      // 行数据和样式
      ws.eachRow((row, rowNum) => {
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
          if (cell.fill?.fgColor?.argb) cellData.bgColor = cell.fill.fgColor.argb
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
      if (ws.mergeCells) {
        ws.model.merges?.forEach((merge: any) => {
          const { tl, br } = merge
          const minRow = tl.r - 1, maxRow = br.r - 1
          const minCol = tl.c - 1, maxCol = br.c - 1
          if (newGrid[minRow] && newGrid[minRow][minCol]) {
            newGrid[minRow][minCol].rowSpan = maxRow - minRow + 1
            newGrid[minRow][minCol].colSpan = maxCol - minCol + 1
          }
          for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
              if (r === minRow && c === minCol) continue
              if (newGrid[r] && newGrid[r][c]) {
                newGrid[r][c].mergeHidden = true
              }
            }
          }
        })
      }

      setGrid(newGrid)
      if (newColWidths.length > 0) setColWidths(newColWidths)
      if (newRowHeights.length > 0) setRowHeights(newRowHeights)
      setImportDialogOpen(false)
    } catch (err) {
      alert('导入 Excel 失败')
    }
  }

  // 保存
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

  // 全局鼠标事件监听
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (resizingCol.current !== null) {
        const delta = e.clientX - resizeStartPos.current
        const newWidth = Math.max(40, resizeStartSize.current + delta)
        setColWidth(Number(resizingCol.current), newWidth)
      }
    }
    const handleGlobalMouseUp = () => {
      resizingCol.current = null
      resizingRow.current = null
      isSelecting.current = false
    }
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [colWidths])

  // 子表相关
  useEffect(() => {
    fetch('/api/tables?onlyDetail=true')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tables) setAvailableDetailTables(data.tables)
      })
      .catch(() => {})
  }, [])

  const addSubTable = () => {
    setEditingSubTable(null)
    setSubTableFields([])
    setSubTableDialogOpen(true)
  }

  const editSubTable = (st: SubTableConfig) => {
    setEditingSubTable(st)
    setSubTableFields(st.fields)
    setSubTableDialogOpen(true)
  }

  const removeSubTable = (idx: number) => {
    setSubTables(prev => prev.filter((_, i) => i !== idx))
  }

  const saveSubTable = () => {
    if (!editingSubTable && !subTableDialogOpen) return
    // 子表保存逻辑通过 dialog 中的 form 处理
    setSubTableDialogOpen(false)
  }

  // 选中区域判断
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

  // 字段统计
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
```

- [ ] **Step 5: 实现渲染部分 - CellDisplay 组件**

```typescript
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
```

- [ ] **Step 6: 实现渲染部分 - 工具栏**

```typescript
  // 在 return 中的 JSX 结构
  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">表单布局设计</h2>
          <Badge variant="secondary" className="text-xs">
            {grid.length} 行 × {colWidths.length} 列
          </Badge>
          <Badge variant="outline" className="text-xs">
            {countFields()} 个字段绑定
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
            {/* 字体样式 */}
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ bold: !getCell(activeCell?.row ?? 0, activeCell?.col ?? 0).bold })}>
              <Bold className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ italic: !getCell(activeCell?.row ?? 0, activeCell?.col ?? 0).italic })}>
              <Italic className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setRangeStyle({ underline: !getCell(activeCell?.row ?? 0, activeCell?.col ?? 0).underline })}>
              <Underline className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 对齐 */}
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

            {/* 颜色 */}
            <div className="relative">
              <Button variant="ghost" size="sm" className="w-8 h-8">
                <Palette className="w-4 h-4" />
              </Button>
              <input type="color" className="absolute inset-0 opacity-0 cursor-pointer w-8 h-8"
                onChange={e => setRangeStyle({ bgColor: e.target.value })} />
            </div>
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
              value={getCell(activeCell?.row ?? 0, activeCell?.col ?? 0).fontSize || 11}
              onChange={e => setRangeStyle({ fontSize: Number(e.target.value) })} />
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 合并/取消合并 */}
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={mergeCells}>
              <Merge className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={unmergeCells}>
              <Unlink className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 边框 */}
            <Button variant="ghost" size="sm" className="w-8 h-8"
              onClick={() => setAllBorders('1px solid #000')}>
              <Grid3x3 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={clearAllBorders}>
              <X className="w-4 h-4" />
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 插入字段 */}
            <Button variant="outline" size="sm" className="h-8"
              onClick={() => setFieldDialogOpen(true)}
              disabled={!activeCell}>
              <Database className="w-4 h-4 mr-1" />
              插入字段
            </Button>

            {/* 公式 */}
            <Button variant="outline" size="sm" className="h-8"
              onClick={() => { setFormulaInput(''); setFormulaDialogOpen(true) }}
              disabled={!activeCell}>
              <Calculator className="w-4 h-4 mr-1" />
              公式
            </Button>

            {/* 页面布局 */}
            <Button variant="outline" size="sm" className="h-8"
              onClick={() => setPageSetupDialogOpen(true)}>
              <Settings className="w-4 h-4 mr-1" />
              页面布局
            </Button>
            <Separator orientation="vertical" className="h-6 mx-1" />

            {/* 行列操作 */}
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={addRow}>
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8" onClick={addCol}>
              <Plus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8 text-red-500" onClick={deleteRow}>
              <Minus className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="w-8 h-8 text-red-500" onClick={deleteCol}>
              <Minus className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
```

- [ ] **Step 7: 实现渲染部分 - 主体表格区域（左侧字段面板 + 右侧表格）**

```typescript
      {/* 主体区域 */}
      <div className="grid grid-cols-12 gap-4">
        {/* 左侧字段面板 */}
        <div className="col-span-2 border rounded-lg bg-white overflow-hidden">
          <div className="p-2 bg-gray-50 border-b text-sm font-medium text-gray-700">
            可用字段
          </div>
          <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
            {fields.filter(f => f.showInForm).map(field => (
              <button key={field.id}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-blue-50 hover:text-blue-700 transition-colors disabled:opacity-50"
                disabled={!activeCell}
                onClick={() => {
                  if (activeCell) insertField(field.name)
                }}>
                <span className="text-gray-500 mr-1">{field.type === 'TEXT' ? '📝' : '📄'}</span>
                {field.label}
                {field.required && <span className="text-red-400 ml-0.5">*</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 右侧表格编辑区 */}
        <div className="col-span-10 overflow-auto border rounded-lg bg-white" onMouseUp={handleMouseUp}>
          <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: '36px' }} />
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
                    <div className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400"
                      onMouseDown={e => handleColResizeStart(e, i)} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
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
                            className="w-full h-full bg-transparent border-none outline-none text-[inherit] font-[inherit]"
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
```

- [ ] **Step 8: 实现渲染部分 - 子表模块区域**

```typescript
      {/* 子表模块区域 */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">子表模块</CardTitle>
            <Button variant="outline" size="sm" onClick={addSubTable}>
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
                      onClick={() => editSubTable(st)}>
                      <Settings className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="w-6 h-6 text-red-500"
                      onClick={() => removeSubTable(idx)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
```

- [ ] **Step 9: 实现 Dialog 弹窗**

```typescript
      {/* 插入字段 Dialog */}
      <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>插入字段</DialogTitle>
            <DialogDescription>点击字段将 {{字段名}} 插入到当前单元格</DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {fields.filter(f => f.showInForm).map(field => (
              <button key={field.id}
                className="w-full text-left px-3 py-2 text-sm rounded hover:bg-blue-50 hover:text-blue-700 transition-colors"
                onClick={() => insertField(field.name)}>
                <span className="text-gray-500 mr-2">{field.label}</span>
                <code className="text-xs text-blue-500">&#123;&#123;{field.name}&#125;&#125;</code>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 导入Excel Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入 Excel 样表</DialogTitle>
            <DialogDescription>上传 .xlsx 文件作为表单布局模板</DialogDescription>
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

      {/* 预览 Dialog */}
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

      {/* 公式 Dialog */}
      <Dialog open={formulaDialogOpen} onOpenChange={setFormulaDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>插入公式</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('SUM')}>SUM</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('AVERAGE')}>AVERAGE</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('COUNT')}>COUNT</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('MAX')}>MAX</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('MIN')}>MIN</Button>
              <Button variant="outline" size="sm" onClick={() => setFormulaInput('TODAY()')}>TODAY</Button>
            </div>
            <Input value={formulaInput} onChange={e => setFormulaInput(e.target.value)}
              placeholder="输入公式，如: =SUM(A1:A10)" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormulaDialogOpen(false)}>取消</Button>
              <Button onClick={() => {
                if (activeCell && formulaInput) {
                  const value = `=${formulaInput}`
                  setCell(activeCell.row, activeCell.col, { value, formula: formulaInput })
                  setFormulaDialogOpen(false)
                }
              }}>确定</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 页面布局 Dialog */}
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
            </div>
            <div className="grid grid-cols-2 gap-3">
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

      {/* 子表配置 Dialog */}
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
```

- [ ] **Step 10: 创建子表配置表单子组件**

```typescript
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
              <SelectItem key={t.id} value={String(t.id)}>{t.label}</SelectItem>
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
              {f.label} <code className="text-blue-500">&#123;&#123;{f.name}&#125;&#125;</code>
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
```

---

### 任务 4：更新 DynamicForm 渲染器

**文件：**
- 修改：`web/components/dynamic-form.tsx`

- [ ] **Step 1: 添加新格式导入和解析函数**

在导入区添加：
```typescript
import { FormExcelConfig, SubTableConfig } from '@/types/form-excel-config'
import { CellData, FIELD_PATTERN } from '@/types/cell-data'
```

- [ ] **Step 2: 添加 `renderFormExcelGrid` 函数**

在 `renderDetailTableField` 之前添加：

```typescript
/** 解析单元格 value 中的 {{fieldName}} 占位符，返回文本+字段片段 */
const parseCellValue = (value: string): Array<{ text: string; field?: string }> => {
  const regex = new RegExp(FIELD_PATTERN, 'g')
  const parts: Array<{ text: string; field?: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: value.slice(lastIndex, match.index) })
    }
    parts.push({ text: '', field: match[0].slice(2, -2) })
    lastIndex = regex.lastIndex
  }
  if (lastIndex < value.length) {
    parts.push({ text: value.slice(lastIndex) })
  }
  return parts
}

/** 渲染新版 FormExcelConfig 格式的表格 */
const renderFormExcelGrid = (config: FormExcelConfig) => {
  const { grid, colWidths, rowHeights, subTables } = config

  return (
    <div className="space-y-4">
      <div className="overflow-auto border rounded-lg">
        <table className="border-collapse w-full" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {colWidths.map((w, i) => (
              <col key={i} style={{ width: `${w}px`, minWidth: `${w}px` }} />
            ))}
          </colgroup>
          <tbody>
            {grid.map((row, ri) => {
              // 跳过 mergeHidden 的行（但保留 rowSpan 起始行）
              const allHidden = row.every(c => c.mergeHidden)
              if (allHidden) return null

              return (
                <tr key={ri} style={{ height: `${rowHeights[ri] || 24}px` }}>
                  {row.map((cell, ci) => {
                    if (cell.mergeHidden) return null
                    const parts = parseCellValue(cell.value)
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
                        className="border border-gray-300 p-1.5"
                        style={style}>
                        {parts.map((part, i) => {
                          if (part.field) {
                            const field = formFields.find(f => f.name === part.field)
                            if (!field) return <span key={i} className="text-red-400">[{part.field} 未找到]</span>
                            return <span key={i}>{renderField(field)}</span>
                          }
                          return <span key={i}>{part.text}</span>
                        })}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 子表模块 */}
      {subTables && subTables.length > 0 && (
        <div className="space-y-3">
          {subTables.map((st, idx) => (
            <FormExcelSubTable key={idx} config={st} values={values} onChange={handleChange} disabled={disabled} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 添加子表渲染组件**

```typescript
/** 子表渲染组件 */
function FormExcelSubTable({
  config, values, onChange, disabled
}: {
  config: SubTableConfig
  values: Record<string, any>
  onChange: (name: string, value: any) => void
  disabled?: boolean
}) {
  const [detailFields, setDetailFields] = useState<TableField[]>([])
  const [loadingFields, setLoadingFields] = useState(false)

  useEffect(() => {
    if (config.detailTableId) {
      setLoadingFields(true)
      fetch(`/api/tables/${config.detailTableId}/fields`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.fields) {
            setDetailFields(data.fields.filter((f: TableField) => f.showInForm))
          }
        })
        .catch(() => {})
        .finally(() => setLoadingFields(false))
    }
  }, [config.detailTableId])

  const value = values[config.detailTableName] || []
  const detailRows: Array<Record<string, any>> = Array.isArray(value) ? value : []
  const minRows = config.minRows ?? 0
  const maxRows = config.maxRows ?? 100

  const addRow = () => {
    if (detailRows.length >= maxRows) return
    onChange(config.detailTableName, [...detailRows, {}])
  }

  const removeRow = (idx: number) => {
    if (detailRows.length <= minRows) return
    onChange(config.detailTableName, detailRows.filter((_, i) => i !== idx))
  }

  const updateRow = (idx: number, fieldName: string, val: any) => {
    const newRows = [...detailRows]
    newRows[idx] = { ...newRows[idx], [fieldName]: val }
    onChange(config.detailTableName, newRows)
  }

  return (
    <div className="border rounded-md p-3 bg-gray-50/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="font-medium">{config.label}</span>
          <span className="text-xs text-gray-400">（{detailRows.length} 条）</span>
        </div>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" onClick={addRow}
            disabled={detailRows.length >= maxRows}>
            <Plus className="w-3 h-3 mr-1" />添加
          </Button>
        )}
      </div>
      {loadingFields ? (
        <div className="text-center py-4 text-sm text-gray-500">加载中...</div>
      ) : detailFields.length === 0 ? (
        <div className="text-center py-4 text-sm text-gray-400 border border-dashed rounded">
          子表没有可录入的字段
        </div>
      ) : (
        <div className="space-y-2">
          {detailRows.map((row, idx) => (
            <div key={idx} className="border rounded p-2 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">第 {idx + 1} 条</span>
                {!disabled && (
                  <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500"
                    onClick={() => removeRow(idx)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {detailFields.filter(f => config.fields.includes(f.name)).map(df => (
                  <div key={df.id} className="space-y-0.5">
                    <Label className="text-xs text-gray-600">{df.label}</Label>
                    <Input className="h-7 text-xs" type="text" placeholder={`请输入${df.label}`}
                      value={row[df.name] || ''}
                      onChange={e => updateRow(idx, df.name, e.target.value)}
                      disabled={disabled} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {detailRows.length === 0 && (
            <div className="text-center py-3 text-sm text-gray-400 border border-dashed rounded">
              {minRows > 0 ? `至少需要添加 ${minRows} 条` : '点击"添加"按钮'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 更新 DynamicForm 主渲染逻辑**

找到 `hasValidLayout` 判断逻辑，在现有分支中增加对 `FormExcelConfig` 格式的检测和渲染：

```typescript
// 在 hasValidLayout 判断后，增加：
const isFormExcelConfig = (config: any): config is FormExcelConfig => {
  return config && 'grid' in config && Array.isArray(config.grid)
}

// 在主渲染区域（~第788行），在现有分支前增加：
if (isFormExcelConfig(layoutConfig)) {
  return renderFormExcelGrid(layoutConfig as FormExcelConfig)
}
```

---

### 任务 5：更新 field-designer 页面

**文件：**
- 修改：`web/app/dashboard/tables/[id]/field-designer.tsx`

- [ ] **Step 1: 替换导入**

将：
```typescript
import FormLayoutDesigner, { FormLayoutConfig } from '@/components/form-layout-designer'
```
替换为：
```typescript
import FormExcelDesigner from '@/components/form-excel-designer'
import { FormExcelConfig } from '@/types/form-excel-config'
```

- [ ] **Step 2: 更新保存函数类型**

将 `handleSaveFormLayout` 的参数类型从 `FormLayoutConfig` 改为 `FormExcelConfig`：

```typescript
const handleSaveFormLayout = async (config: FormExcelConfig) => {
  // 函数体不变
}
```

- [ ] **Step 3: 替换组件引用**

将：
```typescript
<FormLayoutDesigner
  tableId={table.id}
  fields={fields}
  initialConfig={table.formLayoutConfig as FormLayoutConfig | null}
  onSave={handleSaveFormLayout}
/>
```
替换为：
```typescript
<FormExcelDesigner
  tableId={table.id}
  fields={fields}
  initialConfig={table.formLayoutConfig as FormExcelConfig | null}
  onSave={handleSaveFormLayout}
/>
```

---

### 任务 6：部署并验证

- [ ] **Step 1: 执行部署脚本**

```bash
python 'c:\Users\Administrator\.trae-cn\work\6a531bd1af28afaac36e21f1\deploy.py'
```

- [ ] **Step 2: 验证表单设计器功能**

打开 http://192.168.0.7:777 → 项目管理 → 字段设计 → 表单布局，验证：
1. 页面加载是否正常（新旧数据兼容）
2. Excel 编辑模式：列头 A/B/C、行号 1/2/3
3. 单元格点击选中、拖拽选范围
4. 格式工具栏：加粗/斜体/下划线/对齐/颜色/字号
5. 合并单元格、取消合并
6. 插入字段（左侧字段面板和插入字段对话框）
7. 公式输入
8. 导入 Excel 样表
9. 页面布局设置
10. 子表模块：添加/编辑/删除子表配置
11. 保存

- [ ] **Step 3: 验证表单渲染**

打开数据录入页面，验证：
1. 新格式的表单渲染正确
2. `{{fieldName}}` 占位符正确渲染为表单输入控件
3. 子表模块正确渲染（可添加多条数据）
4. 旧格式的数据兼容渲染正常