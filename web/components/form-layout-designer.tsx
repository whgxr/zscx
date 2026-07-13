"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Save, X,
  PanelLeft, Search, Merge, Split, Columns, Rows,
} from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { cn } from '@/lib/utils'

/* ===================== 类型定义 ===================== */
export type LayoutItemType = 'field' | 'subgroup'

export interface BaseLayoutItem {
  id: string
  type: LayoutItemType
  width: number
}

export interface FieldLayoutItem extends BaseLayoutItem {
  type: 'field'
  fieldId: number
  fieldName: string
  labelWidth?: number
  rowHeight?: number
}

export interface SubGroupLayoutItem extends BaseLayoutItem {
  type: 'subgroup'
  title: string
  columns: number
  defaultLabelWidth?: number
  items: LayoutItem[]
}

export type LayoutItem = FieldLayoutItem | SubGroupLayoutItem

/** Excel 网格单元格 */
export interface FormCellData {
  fieldId: number | null
  fieldName: string
  labelWidth: number
  fontSize: number
  colSpan: number
  rowSpan: number
}

/** 分组（新版：网格模式） */
export interface FormLayoutGroup {
  id: string
  title: string
  columns: number
  defaultLabelWidth?: number
  defaultFontSize?: number
  colWidths: number[]
  rows: FormCellData[][]
  // 旧版兼容
  items?: LayoutItem[]
}

export interface FormLayoutConfig {
  groups: FormLayoutGroup[]
}

/** 旧版类型（保留向后兼容） */
export interface LegacyFormLayoutFieldConfig {
  fieldId: number; fieldName: string; span: 1 | 2
}
export interface LegacyFormLayoutGroup {
  id: string; title: string; fields: LegacyFormLayoutFieldConfig[]
}
export interface LegacyFormLayoutConfig {
  groups: LegacyFormLayoutGroup[]
}

/* ===================== 常量 ===================== */
const DEFAULT_COLUMNS = 4
const DEFAULT_COL_WIDTHS = [100, 180, 100, 180]
const DEFAULT_LABEL_WIDTH = 90
const DEFAULT_FONT_SIZE = 13
const DEFAULT_ROWS = 8
const MIN_COL_WIDTH = 60
const MAX_COL_WIDTH = 500
const MIN_FONT_SIZE = 10
const MAX_FONT_SIZE = 24

const fieldTypeIcons: Record<FieldType, string> = {
  TEXT: '📝', TEXTAREA: '📄', NUMBER: '🔢', INTEGER: '🔢', FLOAT: '🔢',
  DATE: '📅', DATETIME: '📅', SELECT: '📋', RADIO: '🔘',
  MULTISELECT: '☑️', CHECKBOX: '☑️', UPLOAD_FILE: '📎', UPLOAD_IMAGE: '🖼️',
  PHONE: '📞', EMAIL: '📧', IDCARD: '🆔', ADDRESS: '📍', MONEY: '💰',
  SWITCH: '🔄', RICHTEXT: '📝', RELATION: '🔗', DETAIL_TABLE: '📊',
}

const generateId = () => Math.random().toString(36).substring(2, 11)
const makeEmptyCell = (labelW = DEFAULT_LABEL_WIDTH, fontS = DEFAULT_FONT_SIZE): FormCellData => ({
  fieldId: null, fieldName: '', labelWidth: labelW, fontSize: fontS, colSpan: 1, rowSpan: 1,
})
const makeEmptyRow = (cols: number, labelW: number, fontS: number): FormCellData[] =>
  Array.from({ length: cols }, () => makeEmptyCell(labelW, fontS))

/* ===================== 列宽拖拽（非 hook，纯函数） ===================== */
function createColResizeHandler(
  groupId: string,
  colWidths: number[],
  onWidthsChange: (groupId: string, widths: number[]) => void,
) {
  return (colIdx: number) => (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidths = [...colWidths]
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidths = [...startWidths]
      newWidths[colIdx] = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startWidths[colIdx] + delta))
      newWidths[colIdx + 1] = Math.max(MIN_COL_WIDTH, startWidths[colIdx + 1] - delta)
      onWidthsChange(groupId, newWidths)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
}

/* ===================== 工具函数 ===================== */
const isVerticalField = (type: FieldType) =>
  type === 'TEXTAREA' || type === 'UPLOAD_IMAGE' || type === 'UPLOAD_FILE' ||
  type === 'DETAIL_TABLE' || type === 'MULTISELECT' || type === 'CHECKBOX'

/** 计算某个位置是否被同行 colSpan 覆盖 */
const isColCovered = (row: FormCellData[], colIdx: number): boolean => {
  let col = 0
  for (let i = 0; i < row.length; i++) {
    if (col > colIdx) return true
    if (col === colIdx) return false
    col += row[i]?.colSpan || 1
  }
  return col > colIdx
}

/** 计算某个位置是否被上方某行的 rowSpan 覆盖 */
const isRowSpanCovered = (rows: FormCellData[][], rowIdx: number, colIdx: number): boolean => {
  for (let r = 0; r < rowIdx; r++) {
    const row = rows[r]
    let col = 0
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      const span = cell?.colSpan || 1
      const rSpan = cell?.rowSpan || 1
      // 检查 colIdx 是否在 [col, col+span) 范围内，且 rowSpan 覆盖到当前行
      if (colIdx >= col && colIdx < col + span && r + rSpan > rowIdx) return true
      col += span
    }
  }
  return false
}

const makeNewConfig = (): FormLayoutConfig => ({
  groups: [{
    id: generateId(), title: '基本信息', columns: DEFAULT_COLUMNS,
    defaultLabelWidth: DEFAULT_LABEL_WIDTH, defaultFontSize: DEFAULT_FONT_SIZE,
    colWidths: [...DEFAULT_COL_WIDTHS],
    rows: Array.from({ length: DEFAULT_ROWS }, () => makeEmptyRow(DEFAULT_COLUMNS, DEFAULT_LABEL_WIDTH, DEFAULT_FONT_SIZE)),
  }],
})

const migrateItemsToRows = (g: any, labelW: number, fontS: number, cols: number): FormLayoutGroup => {
  const items: LayoutItem[] = g.items || []
  const rows: FormCellData[][] = []
  let currentRow: FormCellData[] = []
  let currentCol = 0
  for (const item of items) {
    if (item.type === 'subgroup') continue
    const fi = item as FieldLayoutItem
    const span = Math.min(fi.width || 1, cols - currentCol)
    if (span <= 0) { rows.push(currentRow); currentRow = []; currentCol = 0 }
    currentRow.push({ fieldId: fi.fieldId, fieldName: fi.fieldName, labelWidth: fi.labelWidth || labelW, fontSize: fontS, colSpan: Math.max(1, span), rowSpan: 1 })
    currentCol += span
    if (currentCol >= cols) { rows.push(currentRow); currentRow = []; currentCol = 0 }
  }
  if (currentRow.length > 0) rows.push(currentRow)
  while (rows.length < 4) rows.push(makeEmptyRow(cols, labelW, fontS))
  return {
    id: g.id, title: g.title, columns: cols,
    defaultLabelWidth: g.defaultLabelWidth || labelW,
    defaultFontSize: g.defaultFontSize || fontS,
    colWidths: g.colWidths || [...DEFAULT_COL_WIDTHS],
    rows,
  }
}

/* ===================== 主组件 ===================== */
interface Props {
  tableId: number
  fields: TableField[]
  initialConfig?: FormLayoutConfig | LegacyFormLayoutConfig | null
  onSave: (config: FormLayoutConfig) => Promise<void>
}

export default function FormLayoutDesigner({ tableId, fields, initialConfig, onSave }: Props) {
  const [config, setConfig] = useState<FormLayoutConfig>(() => {
    if (!initialConfig) return makeNewConfig()
    if ('groups' in initialConfig) {
      const cfg = initialConfig as FormLayoutConfig
      // 新版网格格式
      if (cfg.groups.length > 0 && cfg.groups[0].rows) return cfg
      // 旧版 items 格式 → 迁移为网格
      if (cfg.groups.length > 0 && cfg.groups[0].items) {
        return {
          groups: cfg.groups.map(g => migrateItemsToRows(g, DEFAULT_LABEL_WIDTH, DEFAULT_FONT_SIZE, DEFAULT_COLUMNS)),
        }
      }
      return cfg
    }
    return makeNewConfig()
  })

  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCell, setSelectedCell] = useState<{ groupId: string; row: number; col: number } | null>(null)

  const getFieldById = (fid: number | null) => (fid != null ? fields.find(f => f.id === fid) : null)
  const unassignedFields = fields.filter(f =>
    f.showInForm && !config.groups.some(g =>
      g.rows.some(row => row.some(cell => cell.fieldId === f.id))
    )
  )

  /* ---- 分组操作 ---- */

  const addGroup = () => {
    const g: FormLayoutGroup = {
      id: generateId(), title: `分组 ${config.groups.length + 1}`, columns: DEFAULT_COLUMNS,
      defaultLabelWidth: DEFAULT_LABEL_WIDTH, defaultFontSize: DEFAULT_FONT_SIZE,
      colWidths: [...DEFAULT_COL_WIDTHS],
      rows: Array.from({ length: DEFAULT_ROWS }, () => makeEmptyRow(DEFAULT_COLUMNS, DEFAULT_LABEL_WIDTH, DEFAULT_FONT_SIZE)),
    }
    setConfig(p => ({ ...p, groups: [...p.groups, g] }))
  }

  const removeGroup = (id: string) => {
    if (config.groups.length <= 1) return
    setConfig(p => ({ ...p, groups: p.groups.filter(g => g.id !== id) }))
    if (selectedCell?.groupId === id) setSelectedCell(null)
  }

  const reorderGroup = (id: string, dir: 'up' | 'down') => {
    setConfig(p => {
      const idx = p.groups.findIndex(g => g.id === id)
      const t = dir === 'up' ? idx - 1 : idx + 1
      if (t < 0 || t >= p.groups.length) return p
      const gs = [...p.groups]; [gs[idx], gs[t]] = [gs[t], gs[idx]]
      return { ...p, groups: gs }
    })
  }

  /* ---- 网格操作 ---- */
  const updateGroup = (groupId: string, updater: (g: FormLayoutGroup) => FormLayoutGroup) => {
    setConfig(p => ({ ...p, groups: p.groups.map(g => g.id === groupId ? updater(g) : g) }))
  }

  const addFieldToCell = (groupId: string, row: number, col: number, field: TableField) => {
    updateGroup(groupId, g => {
      if (row >= g.rows.length || col >= g.columns) return g
      if (isColCovered(g.rows[row], col) || isRowSpanCovered(g.rows, row, col)) return g
      const newRows = g.rows.map((r, ri) => {
        if (ri !== row) return r
        return r.map((c, ci) => ci === col ? {
          ...c, fieldId: field.id, fieldName: field.name,
          labelWidth: c.labelWidth || g.defaultLabelWidth || DEFAULT_LABEL_WIDTH,
          fontSize: c.fontSize || g.defaultFontSize || DEFAULT_FONT_SIZE,
          colSpan: 1, rowSpan: 1,
        } : c)
      })
      return { ...g, rows: newRows }
    })
  }

  const removeFieldFromCell = (groupId: string, row: number, col: number) => {
    updateGroup(groupId, g => {
      const newRows = g.rows.map((r, ri) => {
        if (ri !== row) return r
        return r.map((c, ci) => ci === col ? makeEmptyCell(g.defaultLabelWidth, g.defaultFontSize) : c)
      })
      return { ...g, rows: newRows }
    })
  }

  const setCellColSpan = (groupId: string, row: number, col: number, span: number) => {
    updateGroup(groupId, g => {
      if (row >= g.rows.length) return g
      const maxSpan = g.columns - col
      const actualSpan = Math.min(span, maxSpan)
      if (actualSpan < 2) {
        // 取消列合并：恢复被覆盖列
        const newRows = g.rows.map((r, ri) => {
          if (ri !== row) return r
          return r.map((c, ci) => {
            if (ci === col) return { ...c, colSpan: 1 }
            if (ci > col && ci < col + (c.colSpan || 1)) return makeEmptyCell(g.defaultLabelWidth, g.defaultFontSize)
            return c
          })
        })
        return { ...g, rows: newRows }
      }
      // 向右合并：清除被覆盖单元格的数据（Excel行为）
      const newRows = g.rows.map((r, ri) => {
        if (ri !== row) return r
        return r.map((c, ci) => {
          if (ci === col) return { ...c, colSpan: actualSpan }
          if (ci > col && ci < col + actualSpan) return { ...c, fieldId: null, fieldName: '', colSpan: 1, rowSpan: 1 }
          return c
        })
      })
      return { ...g, rows: newRows }
    })
  }

  const setCellRowSpan = (groupId: string, row: number, col: number, span: number) => {
    updateGroup(groupId, g => {
      if (row >= g.rows.length) return g
      const maxSpan = g.rows.length - row
      const actualSpan = Math.min(span, maxSpan)
      if (actualSpan < 2) {
        // 取消行合并：恢复被覆盖行对应位置为空单元格
        const oldSpan = g.rows[row][col]?.rowSpan || 1
        const newRows = g.rows.map((rr, ri) => {
          if (ri === row) return rr.map((c, ci) => ci === col ? { ...c, rowSpan: 1 } : c)
          if (ri > row && ri < row + oldSpan) {
            return rr.map((c, ci) => ci === col ? makeEmptyCell(g.defaultLabelWidth, g.defaultFontSize) : c)
          }
          return rr
        })
        return { ...g, rows: newRows }
      }
      // 向下合并：清除被覆盖单元格的数据（Excel行为）
      const newRows = g.rows.map((rr, ri) => {
        if (ri === row) return rr.map((c, ci) => ci === col ? { ...c, rowSpan: actualSpan } : c)
        if (ri > row && ri < row + actualSpan) {
          return rr.map((c, ci) => ci === col ? { ...c, fieldId: null, fieldName: '', colSpan: 1, rowSpan: 1 } : c)
        }
        return rr
      })
      return { ...g, rows: newRows }
    })
  }

  const setCellFontSize = (groupId: string, row: number, col: number, size: number) => {
    updateGroup(groupId, g => ({
      ...g,
      rows: g.rows.map((r, ri) => ri !== row ? r : r.map((c, ci) => ci === col ? { ...c, fontSize: size } : c)),
    }))
  }

  const setCellLabelWidth = (groupId: string, row: number, col: number, w: number) => {
    updateGroup(groupId, g => ({
      ...g,
      rows: g.rows.map((r, ri) => ri !== row ? r : r.map((c, ci) => ci === col ? { ...c, labelWidth: w } : c)),
    }))
  }

  const addRow = (groupId: string) => {
    updateGroup(groupId, g => ({
      ...g,
      rows: [...g.rows, makeEmptyRow(g.columns, g.defaultLabelWidth || DEFAULT_LABEL_WIDTH, g.defaultFontSize || DEFAULT_FONT_SIZE)],
    }))
  }

  const removeRow = (groupId: string) => {
    updateGroup(groupId, g => {
      if (g.rows.length <= 1) return g
      return { ...g, rows: g.rows.slice(0, -1) }
    })
  }

  const addColumn = (groupId: string) => {
    updateGroup(groupId, g => {
      if (g.columns >= 8) return g
      const newCols = g.columns + 1
      const newWidths = [...g.colWidths, 150]
      const newRows = g.rows.map(r => [...r, makeEmptyCell(g.defaultLabelWidth, g.defaultFontSize)])
      return { ...g, columns: newCols, colWidths: newWidths, rows: newRows }
    })
  }

  const removeColumn = (groupId: string) => {
    updateGroup(groupId, g => {
      if (g.columns <= 1) return g
      const newCols = g.columns - 1
      const newWidths = g.colWidths.slice(0, -1)
      // 截断每行最后一个单元格，并调整超出 colSpan
      const newRows = g.rows.map(r => {
        const trimmed = r.slice(0, newCols)
        return trimmed.map(c => ({ ...c, colSpan: Math.min(c.colSpan, newCols) }))
      })
      return { ...g, columns: newCols, colWidths: newWidths, rows: newRows }
    })
  }

  const updateColWidths = (groupId: string, widths: number[]) => {
    updateGroup(groupId, g => ({ ...g, colWidths: widths }))
  }

  const handleSave = async () => { setSaving(true); try { await onSave(config) } finally { setSaving(false) } }

  /* =================== 渲染 =================== */
  const renderCell = (cell: FormCellData, rowIdx: number, colIdx: number, group: FormLayoutGroup, groupId: string) => {
    if (isColCovered(group.rows[rowIdx], colIdx) || isRowSpanCovered(group.rows, rowIdx, colIdx)) return null
    const isSelected = selectedCell?.groupId === groupId && selectedCell?.row === rowIdx && selectedCell?.col === colIdx
    const field = getFieldById(cell.fieldId)
    const vertical = field ? isVerticalField(field.type) : false

    return (
      <td
        key={colIdx}
        colSpan={cell.colSpan || 1}
        rowSpan={(cell.rowSpan && cell.rowSpan > 1) ? cell.rowSpan : undefined}
        className={cn(
          'border border-[#D9D9D9] min-h-[36px] relative group/cell transition-colors cursor-pointer',
          isSelected ? 'ring-2 ring-blue-400 ring-inset' : 'hover:bg-blue-50/30',
          cell.fieldId == null && 'bg-gray-50/50',
        )}
        onClick={() => setSelectedCell({ groupId, row: rowIdx, col: colIdx })}
      >
        {field ? (
          <div className={vertical ? 'excel-cell-vertical relative' : 'excel-cell-horizontal relative'}>
            {/* hover 时显示删除按钮 */}
            <button
              onClick={e => { e.stopPropagation(); removeFieldFromCell(groupId, rowIdx, colIdx) }}
              className="absolute top-0.5 right-0.5 z-10 w-4 h-4 flex items-center justify-center rounded-full bg-red-100 text-red-500 opacity-0 group-hover/cell:opacity-100 hover:!bg-red-200 hover:!text-red-700 transition-opacity"
              title="移除字段"
            >
              <X className="w-2.5 h-2.5" />
            </button>
            <div className="excel-cell-label" style={vertical ? undefined : { width: `${cell.labelWidth}px`, minWidth: `${cell.labelWidth}px` }}>
              <span style={{ fontSize: `${cell.fontSize}px` }}>{field.label}</span>
              {field.required && <span className="text-red-500 ml-0.5">*</span>}
              {/* 标签-输入 分隔拖拽条 */}
              {!vertical && (
                <div
                  className="absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-blue-400 z-10 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation()
                    const startX = e.clientX; const startW = cell.labelWidth
                    const onMove = (ev: MouseEvent) => {
                      const newW = Math.max(40, Math.min(300, startW + ev.clientX - startX))
                      setCellLabelWidth(groupId, rowIdx, colIdx, newW)
                    }
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                      document.body.style.cursor = ''
                      document.body.style.userSelect = ''
                    }
                    document.body.style.cursor = 'col-resize'
                    document.body.style.userSelect = 'none'
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                  }}
                />
              )}
            </div>
            <div className="excel-cell-value">
              <span className="text-[13px] text-gray-400" style={{ fontSize: `${cell.fontSize}px` }}>
                {field.placeholder || `请输入${field.label}`}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-gray-400 pointer-events-none">
            {isSelected ? '← 点击左侧字段' : ''}
          </div>
        )}

        {/* 单元格悬浮工具栏 */}
        {isSelected && (
          <div className="absolute -top-7 left-0 flex items-center gap-0.5 bg-white border border-gray-200 rounded-t-lg shadow-sm px-1.5 py-0.5 z-30 text-[10px] whitespace-nowrap">
            {/* 字体大小 */}
            <span className="text-gray-400 tabular-nums px-0.5">{cell.fontSize}</span>
            <button onClick={e => { e.stopPropagation(); setCellFontSize(groupId, rowIdx, colIdx, Math.max(MIN_FONT_SIZE, cell.fontSize - 1)) }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded font-bold">−</button>
            <button onClick={e => { e.stopPropagation(); setCellFontSize(groupId, rowIdx, colIdx, Math.min(MAX_FONT_SIZE, cell.fontSize + 1)) }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded font-bold">+</button>
            <div className="w-px h-3 bg-gray-200 mx-0.5" />
            {/* 标签宽度 */}
            <span className="text-gray-400 tabular-nums px-0.5">{cell.labelWidth}</span>
            <button onClick={e => { e.stopPropagation(); setCellLabelWidth(groupId, rowIdx, colIdx, Math.max(50, cell.labelWidth - 10)) }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded font-bold">−</button>
            <button onClick={e => { e.stopPropagation(); setCellLabelWidth(groupId, rowIdx, colIdx, Math.min(300, cell.labelWidth + 10)) }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded font-bold">+</button>
            <div className="w-px h-3 bg-gray-200 mx-0.5" />
            {/* 水平合并 */}
            <button onClick={e => { e.stopPropagation(); setCellColSpan(groupId, rowIdx, colIdx, cell.colSpan + 1) }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-blue-600 rounded" title="向右合并列"><Merge className="w-3 h-3" /></button>
            {cell.colSpan > 1 && (
              <button onClick={e => { e.stopPropagation(); setCellColSpan(groupId, rowIdx, colIdx, cell.colSpan - 1) }}
                className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-blue-600 rounded" title="取消列合并"><Split className="w-3 h-3" /></button>
            )}
            {/* 垂直合并 */}
            <button onClick={e => { e.stopPropagation(); setCellRowSpan(groupId, rowIdx, colIdx, (cell.rowSpan || 1) + 1) }}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-green-600 rounded" title="向下合并行"><Merge className="w-3 h-3 rotate-90" /></button>
            {(cell.rowSpan || 1) > 1 && (
              <button onClick={e => { e.stopPropagation(); setCellRowSpan(groupId, rowIdx, colIdx, 1) }}
                className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-green-600 rounded" title="取消行合并"><Split className="w-3 h-3 rotate-90" /></button>
            )}
            {/* 移除字段（仅有字段时显示） */}
            {field && (
              <>
                <div className="w-px h-3 bg-gray-200 mx-0.5" />
                <button onClick={e => { e.stopPropagation(); removeFieldFromCell(groupId, rowIdx, colIdx) }}
                  className="w-4 h-4 flex items-center justify-center text-red-400 hover:text-red-600 rounded" title="移除字段"><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </div>
        )}
      </td>
    )
  }

  const renderGroup = (group: FormLayoutGroup, index: number) => {
    const colResizeHandler = createColResizeHandler(group.id, group.colWidths, updateColWidths)

    return (
      <div key={group.id} className="excel-form-group relative group/group">
        {/* 分组标题行 */}
        <div className="excel-group-header">
          <Input value={group.title} onChange={e => updateGroup(group.id, g => ({ ...g, title: e.target.value }))}
            className="h-5 text-sm font-semibold bg-transparent border-0 px-1 focus-visible:ring-0 w-32" onClick={e => e.stopPropagation()} />
          <span className="text-[10px] text-gray-400 ml-1">{group.columns}列 × {group.rows.length}行</span>

          {/* 分组控制栏 */}
          <div className="ml-auto hidden group-hover/group:flex items-center gap-1">
            <button onClick={() => addColumn(group.id)} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-blue-600" title="添加列" disabled={group.columns >= 8}><Columns className="w-3 h-3" /></button>
            <button onClick={() => removeColumn(group.id)} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-blue-600" title="删除列" disabled={group.columns <= 1}><Columns className="w-3 h-3 opacity-50" /></button>
            <div className="w-px h-3 bg-gray-200 mx-0.5" />
            <button onClick={() => addRow(group.id)} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-green-600" title="添加行"><Rows className="w-3 h-3" /></button>
            <button onClick={() => removeRow(group.id)} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-400" title="删除行" disabled={group.rows.length <= 1}><Rows className="w-3 h-3 opacity-50" /></button>
            <div className="w-px h-3 bg-gray-200 mx-0.5" />
            <button onClick={() => reorderGroup(group.id, 'up')} disabled={index === 0} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
            <button onClick={() => reorderGroup(group.id, 'down')} disabled={index === config.groups.length - 1} className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
            <div className="w-px h-3 bg-gray-200 mx-0.5" />
            <button onClick={() => removeGroup(group.id)} disabled={config.groups.length <= 1} className="w-4 h-4 flex items-center justify-center text-red-400 hover:text-red-600 disabled:opacity-30"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>

        {/* 列宽标尺行 */}
        <div className="flex border-b border-[#D9D9D9] bg-[#FAFAFA]">
          {group.colWidths.map((w, ci) => (
            <div key={ci} className="relative flex items-center justify-center text-[10px] text-gray-400 py-1 select-none"
                 style={{ width: `${w}px`, minWidth: `${w}px`, flexShrink: 0 }}>
              <input
                type="number"
                value={w}
                min={MIN_COL_WIDTH}
                max={MAX_COL_WIDTH}
                className="w-12 h-4 text-[10px] text-center text-gray-500 bg-transparent border border-transparent hover:border-gray-300 focus:border-blue-400 focus:outline-none rounded-sm"
                onClick={e => e.stopPropagation()}
                onChange={e => {
                  const v = parseInt(e.target.value)
                  if (!isNaN(v) && v >= MIN_COL_WIDTH && v <= MAX_COL_WIDTH) {
                    const newWidths = [...group.colWidths]
                    newWidths[ci] = v
                    updateColWidths(group.id, newWidths)
                  }
                }}
                onBlur={e => {
                  const v = parseInt(e.target.value)
                  if (isNaN(v) || v < MIN_COL_WIDTH || v > MAX_COL_WIDTH) {
                    const newWidths = [...group.colWidths]
                    newWidths[ci] = group.colWidths[ci]
                    updateColWidths(group.id, newWidths)
                  }
                }}
              />
              {ci < group.colWidths.length - 1 && (
                <div className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-blue-400/50 z-10 transition-colors"
                     onMouseDown={colResizeHandler(ci)} />
              )}
              {/* 最后一列：右边缘拖拽只改自身宽度 */}
              {ci === group.colWidths.length - 1 && (
                <div
                  className="absolute top-0 right-0 w-[5px] h-full cursor-col-resize hover:bg-blue-400/50 z-10 transition-colors"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startX = e.clientX
                    const startW = group.colWidths[ci]
                    const onMove = (ev: MouseEvent) => {
                      const newW = Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, startW + ev.clientX - startX))
                      const newWidths = [...group.colWidths]
                      newWidths[ci] = newW
                      updateColWidths(group.id, newWidths)
                    }
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                      document.body.style.cursor = ''
                      document.body.style.userSelect = ''
                    }
                    document.body.style.cursor = 'col-resize'
                    document.body.style.userSelect = 'none'
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* 网格 */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              {group.colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
            </colgroup>
            <tbody>
              {group.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => renderCell(cell, ri, ci, group, group.id))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  /* =================== 主界面 =================== */
  const selectedGroupHasCell = selectedCell != null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">表单布局设计</h2>
          <p className="text-sm text-gray-500 mt-1">点击单元格选中，再点击左侧字段添加 | 拖拽列边框调整宽度 | 选中单元格可合并/字体/标签宽度</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addGroup}><Plus className="w-4 h-4 mr-2" />添加分组</Button>
          <Button onClick={handleSave} disabled={saving}><Save className="w-4 h-4 mr-2" />{saving ? '保存中...' : '保存布局'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* 左侧字段面板 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PanelLeft className="w-4 h-4" />
                未分配字段
                <Badge variant="secondary" className="ml-auto">{unassignedFields.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="搜索字段..." className="pl-9 h-8 text-sm" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)} />
              </div>
              <div className="space-y-1 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto p-1">
                {(() => {
                  const filtered = searchQuery
                    ? unassignedFields.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.label.toLowerCase().includes(searchQuery.toLowerCase()))
                    : unassignedFields
                  return filtered.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm">{searchQuery ? '未找到' : '全部已分配'}</div>
                  ) : (
                    filtered.map(field => (
                      <div
                        key={field.id}
                        onClick={() => {
                          if (!selectedCell) return
                          addFieldToCell(selectedCell.groupId, selectedCell.row, selectedCell.col, field)
                        }}
                        className={cn(
                          'flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all text-left',
                          selectedGroupHasCell ? 'hover:bg-blue-50 hover:border-blue-200 border border-transparent' : 'opacity-50 cursor-not-allowed border border-transparent',
                        )}
                      >
                        <span className="text-base flex-shrink-0">{fieldTypeIcons[field.type]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{field.label}</div>
                          <div className="text-xs text-gray-500 truncate">{field.name}</div>
                        </div>
                        {field.required && <Badge variant="destructive" className="text-[10px] h-4 px-1">必填</Badge>}
                      </div>
                    ))
                  )
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧网格设计器 */}
        <div className="lg:col-span-3">
          {config.groups.map((group, index) => renderGroup(group, index))}
        </div>
      </div>
    </div>
  )
}