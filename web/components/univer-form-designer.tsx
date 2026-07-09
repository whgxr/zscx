"use client"

import { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Trash2,
  Save,
  FolderOpen,
  PanelLeft,
  Search,
} from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { UniverSheetEditor, UniverSheetEditorHandle } from '@/components/univer-sheet-editor'
import type { IWorkbookData, IWorksheetData, ICellData, IRange } from '@univerjs/core'

// ── Re-export types from form-layout-designer for compatibility ──

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
}

export interface SubGroupLayoutItem extends BaseLayoutItem {
  type: 'subgroup'
  title: string
  columns: number
  items: LayoutItem[]
}

export type LayoutItem = FieldLayoutItem | SubGroupLayoutItem

export interface FormLayoutGroup {
  id: string
  title: string
  columns: number
  items: LayoutItem[]
}

export interface FormLayoutConfig {
  groups: FormLayoutGroup[]
}

// ── Props ──

interface UniverFormDesignerProps {
  tableId: number
  fields: TableField[]
  initialConfig?: FormLayoutConfig | null
  onSave: (config: FormLayoutConfig) => Promise<void>
}

// ── Constants ──

const GRID_COLUMNS = 6
const GROUP_HEADER_ROW_HEIGHT = 36
const FIELD_ROW_HEIGHT = 40
const EMPTY_ROW_HEIGHT = 10
const LABEL_COL_WIDTH = 120
const VALUE_COL_WIDTH = 160

const fieldTypeIcons: Record<FieldType, string> = {
  TEXT: '\u{1F4DD}',
  TEXTAREA: '\u{1F4C4}',
  NUMBER: '\u{1F522}',
  INTEGER: '\u{1F522}',
  FLOAT: '\u{1F522}',
  DATE: '\u{1F4C5}',
  DATETIME: '\u{1F4C5}',
  SELECT: '\u{1F4CB}',
  RADIO: '\u{1F518}',
  MULTISELECT: '\u{2611}\u{FE0F}',
  CHECKBOX: '\u{2611}\u{FE0F}',
  UPLOAD_FILE: '\u{1F4CE}',
  UPLOAD_IMAGE: '\u{1F5BC}\u{FE0F}',
  PHONE: '\u{1F4DE}',
  EMAIL: '\u{1F4E7}',
  IDCARD: '\u{1F194}',
  ADDRESS: '\u{1F4CD}',
  MONEY: '\u{1F4B0}',
  SWITCH: '\u{1F504}',
  RICHTEXT: '\u{1F4DD}',
  RELATION: '\u{1F517}',
  DETAIL_TABLE: '\u{1F4CA}',
}

const generateId = () => Math.random().toString(36).substring(2, 11)

// ── Cell metadata stored in ICellData.custom ──

interface FieldCellMeta {
  kind: 'field'
  id: string
  fieldId: number
  fieldName: string
  width: number
  labelWidth?: number
}

interface SubGroupHeaderMeta {
  kind: 'subgroup-header'
  id: string
  title: string
  columns: number
  width: number
}

interface GroupHeaderMeta {
  kind: 'group-header'
  id: string
  title: string
  columns: number
}

type CellMeta = FieldCellMeta | SubGroupHeaderMeta | GroupHeaderMeta

// ── Conversion: FormLayoutConfig → IWorkbookData ──

function configToUniverData(config: FormLayoutConfig): IWorkbookData {
  const sheetId = generateId()
  const styles: Record<string, any> = {}
  let styleIdx = 0

  const registerStyle = (style: Record<string, any>): string => {
    const key = `s${styleIdx++}`
    styles[key] = style
    return key
  }

  // Pre-register common styles
  const groupHeaderStyleId = registerStyle({
    bl: { s: 1 },
    fs: 13,
    ht: 0, // left
    vt: 2, // middle
  })

  const subgroupHeaderStyleId = registerStyle({
    bl: { s: 1 },
    fs: 12,
    ht: 0,
    vt: 2,
  })

  const fieldLabelStyleId = registerStyle({
    ht: 2, // right
    vt: 2,
    cl: { rgb: '#666666' },
  })

  const fieldValueStyleId = registerStyle({
    ht: 0,
    vt: 2,
    bd: {
      b: { s: 2, cl: { rgb: '#CCCCCC' } },
    },
  })

  const cellData: Record<number, Record<number, ICellData>> = {}
  const mergeData: IRange[] = []
  const rowData: Record<number, { h?: number; s?: string }> = {}
  const columnData: Record<number, { w?: number }> = {}

  // Set up 12 columns: 6 pairs of (label, value)
  for (let col = 0; col < GRID_COLUMNS * 2; col++) {
    columnData[col] = { w: col % 2 === 0 ? LABEL_COL_WIDTH : VALUE_COL_WIDTH }
  }

  let currentRow = 0

  const setCell = (row: number, col: number, data: ICellData) => {
    if (!cellData[row]) cellData[row] = {}
    cellData[row][col] = data
  }

  config.groups?.forEach((group, groupIndex) => {
    // Group header row
    const groupMeta: GroupHeaderMeta = {
      kind: 'group-header',
      id: group.id,
      title: group.title,
      columns: group.columns,
    }
    setCell(currentRow, 0, {
      v: `\u{1F4C1} ${group.title}`,
      s: groupHeaderStyleId,
      custom: groupMeta as any,
    })
    mergeData.push({
      startRow: currentRow,
      endRow: currentRow,
      startColumn: 0,
      endColumn: GRID_COLUMNS * 2 - 1,
    })
    rowData[currentRow] = { h: GROUP_HEADER_ROW_HEIGHT }

    currentRow++

    // Render items within the group
    const renderItems = (items: LayoutItem[], groupColumns: number, startRow: number): number => {
      let row = startRow
      let colCursor = 0 // tracks position in the grid (0..groupColumns-1)

      const placeField = (item: FieldLayoutItem) => {
        const width = Math.min(item.width, groupColumns - colCursor)
        const labelCol = colCursor * 2
        const valueCol = colCursor * 2 + 1

        const meta: FieldCellMeta = {
          kind: 'field',
          id: item.id,
          fieldId: item.fieldId,
          fieldName: item.fieldName,
          width: item.width,
          labelWidth: item.labelWidth,
        }

        setCell(row, labelCol, {
          v: item.fieldName,
          s: fieldLabelStyleId,
          custom: meta as any,
        })

        // Merge value cells if width > 1
        if (width > 1) {
          const endValueCol = labelCol + width * 2 - 1
          setCell(row, valueCol, {
            v: '',
            s: fieldValueStyleId,
          })
          if (endValueCol > valueCol) {
            mergeData.push({
              startRow: row,
              endRow: row,
              startColumn: valueCol,
              endColumn: endValueCol,
            })
          }
        } else {
          setCell(row, valueCol, {
            v: '',
            s: fieldValueStyleId,
          })
        }

        rowData[row] = { h: FIELD_ROW_HEIGHT }
        colCursor += width
      }

      for (const item of items) {
        if (item.type === 'field') {
          // If not enough space in current row, wrap to next row
          if (colCursor + item.width > groupColumns) {
            row++
            colCursor = 0
          }
          placeField(item)
          // If row is full, advance
          if (colCursor >= groupColumns) {
            row++
            colCursor = 0
          }
        } else {
          // SubGroupLayoutItem
          const sub = item as SubGroupLayoutItem
          // Wrap to next row if not at start
          if (colCursor > 0) {
            row++
            colCursor = 0
          }

          // Subgroup header
          const subMeta: SubGroupHeaderMeta = {
            kind: 'subgroup-header',
            id: sub.id,
            title: sub.title,
            columns: sub.columns,
            width: sub.width,
          }
          const subHeaderEndCol = sub.width * 2 - 1
          setCell(row, 0, {
            v: `\u{1F4C2} ${sub.title}`,
            s: subgroupHeaderStyleId,
            custom: subMeta as any,
          })
          if (subHeaderEndCol > 0) {
            mergeData.push({
              startRow: row,
              endRow: row,
              startColumn: 0,
              endColumn: subHeaderEndCol,
            })
          }
          rowData[row] = { h: GROUP_HEADER_ROW_HEIGHT }
          row++

          // Render subgroup items with subgroup columns
          let subRow = row
          let subColCursor = 0

          for (const subItem of sub.items) {
            if (subItem.type === 'field') {
              if (subColCursor + subItem.width > sub.columns) {
                subRow++
                subColCursor = 0
              }
              const labelCol = subColCursor * 2
              const valueCol = subColCursor * 2 + 1
              const width = Math.min(subItem.width, sub.columns - subColCursor)

              const meta: FieldCellMeta = {
                kind: 'field',
                id: subItem.id,
                fieldId: subItem.fieldId,
                fieldName: subItem.fieldName,
                width: subItem.width,
                labelWidth: subItem.labelWidth,
              }

              setCell(subRow, labelCol, {
                v: subItem.fieldName,
                s: fieldLabelStyleId,
                custom: meta as any,
              })

              if (width > 1) {
                const endValueCol = labelCol + width * 2 - 1
                setCell(subRow, valueCol, {
                  v: '',
                  s: fieldValueStyleId,
                })
                if (endValueCol > valueCol) {
                  mergeData.push({
                    startRow: subRow,
                    endRow: subRow,
                    startColumn: valueCol,
                    endColumn: endValueCol,
                  })
                }
              } else {
                setCell(subRow, valueCol, {
                  v: '',
                  s: fieldValueStyleId,
                })
              }

              rowData[subRow] = { h: FIELD_ROW_HEIGHT }
              subColCursor += width

              if (subColCursor >= sub.columns) {
                subRow++
                subColCursor = 0
              }
            }
          }

          // If subgroup items didn't fill last row, advance
          if (subColCursor > 0) {
            subRow++
          }
          row = subRow
          colCursor = 0
        }
      }

      // If still mid-row, advance
      if (colCursor > 0) {
        row++
      }

      return row
    }

    currentRow = renderItems(group.items, group.columns, currentRow)

    // Separator row between groups
    if (groupIndex < config.groups.length - 1) {
      rowData[currentRow] = { h: EMPTY_ROW_HEIGHT }
      currentRow++
    }
  })

  // Calculate total rows/cols needed
  const totalRows = Math.max(currentRow + 1, 50)
  const totalCols = GRID_COLUMNS * 2

  const worksheetData: Partial<IWorksheetData> = {
    id: sheetId,
    name: '表单布局',
    tabColor: '',
    hidden: 0,
    freeze: { xSplit: 0, ySplit: 0, startRow: 0, startColumn: 0 },
    rowCount: totalRows,
    columnCount: totalCols,
    zoomRatio: 1,
    scrollTop: 0,
    scrollLeft: 0,
    defaultColumnWidth: VALUE_COL_WIDTH,
    defaultRowHeight: FIELD_ROW_HEIGHT,
    mergeData,
    cellData,
    rowData,
    columnData,
    rowHeader: { width: 46, hidden: 0 },
    columnHeader: { height: 24, hidden: 0 },
    showGridlines: 1,
    rightToLeft: 0,
  }

  return {
    id: generateId(),
    name: '表单布局设计器',
    appVersion: '1.0.0',
    locale: 7 as any, // LocaleType.ZH_CN
    styles,
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: worksheetData,
    },
  }
}

// ── Conversion: IWorkbookData → FormLayoutConfig ──

function univerDataToConfig(data: IWorkbookData, fields: TableField[]): FormLayoutConfig {
  const groups: FormLayoutGroup[] = []

  // Iterate sheets (typically just one)
  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId]
    if (!sheet) continue

    const { cellData } = sheet
    if (!cellData) continue

    // Scan rows to find group headers, subgroup headers, and fields
    let currentGroup: FormLayoutGroup | null = null
    let currentSubGroup: SubGroupLayoutItem | null = null
    let currentRowItems: LayoutItem[] = []
    let rowWidthUsed = 0

    const flushRowItems = () => {
      if (currentSubGroup) {
        currentSubGroup.items.push(...currentRowItems)
      } else if (currentGroup) {
        currentGroup.items.push(...currentRowItems)
      }
      currentRowItems = []
      rowWidthUsed = 0
    }

    // Get sorted rows
    const rows = Object.keys(cellData).map(Number).sort((a, b) => a - b)

    for (const row of rows) {
      const rowCells = cellData[row]
      if (!rowCells) continue

      // Get sorted columns for this row
      const cols = Object.keys(rowCells).map(Number).sort((a, b) => a - b)

      for (const col of cols) {
        const cell = rowCells[col]
        if (!cell) continue

        const meta = cell.custom as CellMeta | undefined
        if (!meta) continue

        if (meta.kind === 'group-header') {
          flushRowItems()
          currentSubGroup = null
          currentGroup = {
            id: meta.id || generateId(),
            title: meta.title,
            columns: meta.columns || 2,
            items: [],
          }
          groups.push(currentGroup)
        } else if (meta.kind === 'subgroup-header') {
          flushRowItems()
          currentSubGroup = {
            id: meta.id || generateId(),
            type: 'subgroup',
            title: meta.title,
            columns: meta.columns || 2,
            width: meta.width || 1,
            items: [],
          }
          if (currentGroup) {
            currentGroup.items.push(currentSubGroup)
          }
        } else if (meta.kind === 'field') {
          // Resolve field label from fields list if possible
          const resolvedField = fields.find(f => f.id === meta.fieldId || f.name === meta.fieldName)
          const fieldName = resolvedField?.name ?? meta.fieldName

          const item: FieldLayoutItem = {
            id: meta.id || generateId(),
            type: 'field',
            fieldId: meta.fieldId,
            fieldName,
            width: meta.width || 1,
            labelWidth: meta.labelWidth,
          }
          currentRowItems.push(item)
          rowWidthUsed += item.width
        }
      }

      // After processing a row of fields, flush
      if (currentRowItems.length > 0) {
        // Check if we need to wrap (if width exceeds columns)
        const containerCols = currentSubGroup?.columns ?? currentGroup?.columns ?? 2
        if (rowWidthUsed >= containerCols) {
          flushRowItems()
        }
      }
    }

    flushRowItems()
  }

  // If no groups found, create a default one
  if (groups.length === 0) {
    groups.push({
      id: generateId(),
      title: '基本信息',
      columns: 2,
      items: [],
    })
  }

  return { groups }
}

// ── Component ──

export default function UniverFormDesigner({
  tableId,
  fields,
  initialConfig,
  onSave,
}: UniverFormDesignerProps) {
  const [saving, setSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const normalizeConfig = (raw: any): FormLayoutConfig => {
    if (!raw || !raw.groups || !Array.isArray(raw.groups)) {
      return { groups: [{ id: generateId(), title: '基本信息', columns: 2, items: [] }] }
    }
    return {
      groups: raw.groups.map((g: any) => ({
        id: g.id || generateId(),
        title: g.title || '未命名分组',
        columns: g.columns || 2,
        items: Array.isArray(g.items) ? g.items.map((item: any) => {
          if (item.type === 'subgroup') {
            return {
              ...item,
              items: Array.isArray(item.items) ? item.items : [],
            }
          }
          return item
        }) : [],
      })),
    }
  }

  const [config, setConfig] = useState<FormLayoutConfig>(() => normalizeConfig(initialConfig))

  const sheetRef = useRef<UniverSheetEditorHandle>(null)

  // Track which field IDs are already placed
  const usedFieldIds = new Set<number>()
  const collectUsedFieldIds = (items: LayoutItem[]) => {
    for (const item of items) {
      if (item.type === 'field') usedFieldIds.add(item.fieldId)
      else if (item.type === 'subgroup') collectUsedFieldIds(item.items)
    }
  }
  config.groups?.forEach(g => collectUsedFieldIds(g.items))

  const unassignedFields = fields.filter(f => f.showInForm && !usedFieldIds.has(f.id))

  const filteredFields = searchQuery
    ? unassignedFields.filter(f =>
        f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : unassignedFields

  // Build initial Univer data from config
  const initialWorkbookData = configToUniverData(config)

  // Handle adding a new group
  const addGroup = useCallback(() => {
    setConfig(prev => ({
      ...prev,
      groups: [
        ...prev.groups,
        {
          id: generateId(),
          title: `分组 ${prev.groups.length + 1}`,
          columns: 2,
          items: [],
        },
      ],
    }))
  }, [])

  // Handle inserting a field at the selected cell
  const handleFieldClick = useCallback((field: TableField) => {
    const sheet = sheetRef.current
    if (!sheet) return

    const selected = sheet.getSelectedCell()
    if (!selected) return

    const newFieldItem: FieldLayoutItem = {
      id: generateId(),
      type: 'field',
      fieldId: field.id,
      fieldName: field.name,
      width: 1,
      labelWidth: 100,
    }

    // Insert field label into the cell via Univer API
    sheet.insertField(field.name)

    // Update local config
    setConfig(prev => {
      // Determine which group the row belongs to
      // For simplicity, add to the first group if not determinable
      const targetGroup = prev.groups[0]
      if (!targetGroup) return prev

      return {
        ...prev,
        groups: prev.groups.map(g => {
          if (g.id !== targetGroup.id) return g
          return { ...g, items: [...g.items, newFieldItem] }
        }),
      }
    })
  }, [])

  // Handle save
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      // Get current data from Univer and convert back
      const data = sheetRef.current?.getData()
      if (data) {
        const reconstructed = univerDataToConfig(data, fields)
        await onSave(reconstructed)
      } else {
        await onSave(config)
      }
    } finally {
      setSaving(false)
    }
  }, [config, fields, onSave])

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">表单布局设计</h2>
          <p className="text-sm text-gray-500 mt-1">
            点击左侧字段插入到表格中，使用6列网格系统自由排列
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addGroup}>
            <Plus className="w-4 h-4 mr-2" />
            添加分组
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存布局'}
          </Button>
        </div>
      </div>

      {/* Main layout: sidebar + Univer sheet */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left sidebar: Available fields */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PanelLeft className="w-4 h-4" />
                未分配字段
                <Badge variant="secondary" className="ml-auto">
                  {unassignedFields.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索字段..."
                  className="pl-9 h-8 text-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="space-y-2 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto">
                {filteredFields.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {searchQuery ? '未找到匹配字段' : '所有字段已分配'}
                  </div>
                ) : (
                  filteredFields.map(field => (
                    <button
                      key={field.id}
                      onClick={() => handleFieldClick(field)}
                      className="w-full flex items-center gap-2 p-2 bg-white border rounded-lg cursor-pointer hover:border-primary/50 hover:shadow-sm hover:bg-primary/5 transition-all text-left"
                    >
                      <span className="text-base">{fieldTypeIcons[field.type]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{field.label}</div>
                        <div className="text-xs text-gray-500 truncate">{field.name}</div>
                      </div>
                      {field.required && (
                        <Badge variant="destructive" className="text-[10px] h-4 px-1">
                          必填
                        </Badge>
                      )}
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Current config groups summary */}
          <Card className="mt-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">分组概览</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {config.groups.map((group, index) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-medium">{group.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {group.columns}列
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {group.items.length}项
                      </Badge>
                      <button
                        onClick={() => {
                          if (config.groups.length <= 1) return
                          setConfig(prev => ({
                            ...prev,
                            groups: prev.groups.filter((_, i) => i !== index),
                          }))
                        }}
                        disabled={config.groups.length <= 1}
                        className="text-red-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right area: Univer Sheet */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0">
              <UniverSheetEditor
                ref={sheetRef}
                initialData={initialWorkbookData}
                readonly={false}
                height="calc(100vh - 240px)"
                onDataChange={(data) => {
                  // Sync config from Univer data changes
                  const newConfig = univerDataToConfig(data, fields)
                  if (newConfig?.groups) {
                    setConfig(normalizeConfig(newConfig))
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
