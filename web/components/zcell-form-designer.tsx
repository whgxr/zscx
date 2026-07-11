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
import { ZCellSheetEditor, ZCellSheetEditorHandle, ZCellWorkbookData, ZCellCellData } from '@/components/zcell-sheet-editor'

// ── 类型定义 ──

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

interface ZCellFormDesignerProps {
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

// ── 转换: FormLayoutConfig → ZCellWorkbookData ──

function configToZCellData(config: FormLayoutConfig, fields: TableField[]): ZCellWorkbookData {
  const cells: Record<string, ZCellCellData> = {}
  const merges: { startRow: number; endRow: number; startCol: number; endCol: number }[] = []
  const rowHeights: Record<number, number> = {}
  const colWidths: Record<number, number> = {}

  // 设置12列: 6对(label, value)
  for (let col = 0; col < GRID_COLUMNS * 2; col++) {
    colWidths[col] = col % 2 === 0 ? LABEL_COL_WIDTH : VALUE_COL_WIDTH
  }

  let currentRow = 0

  const setCell = (row: number, col: number, value: string, style?: Partial<ZCellCellData>) => {
    cells[`${row},${col}`] = {
      value,
      ...style,
    }
  }

  config.groups?.forEach((group, groupIndex) => {
    // 分组标题行
    setCell(currentRow, 0, `\u{1F4C1} ${group.title}`, {
      bold: true,
      fontSize: 13,
      align: 'left',
      verticalAlign: 'middle',
      bgColor: '#E5EDFE',
    })
    merges.push({
      startRow: currentRow,
      endRow: currentRow,
      startCol: 0,
      endCol: GRID_COLUMNS * 2 - 1,
    })
    rowHeights[currentRow] = GROUP_HEADER_ROW_HEIGHT
    currentRow++

    // 渲染分组内的项目
    const renderItems = (items: LayoutItem[], groupColumns: number, startRow: number): number => {
      let row = startRow
      let colCursor = 0

      const placeField = (item: FieldLayoutItem) => {
        const width = Math.min(item.width, groupColumns - colCursor)
        const labelCol = colCursor * 2
        const valueCol = colCursor * 2 + 1
        const field = fields.find(f => f.id === item.fieldId)
        const displayLabel = field?.label || item.fieldName

        setCell(row, labelCol, displayLabel, {
          align: 'right',
          verticalAlign: 'middle',
          textColor: '#666666',
        })

        if (width > 1) {
          const endValueCol = labelCol + width * 2 - 1
          setCell(row, valueCol, '', {
            verticalAlign: 'middle',
          })
          if (endValueCol > valueCol) {
            merges.push({
              startRow: row,
              endRow: row,
              startCol: valueCol,
              endCol: endValueCol,
            })
          }
        } else {
          setCell(row, valueCol, '', {
            verticalAlign: 'middle',
          })
        }

        rowHeights[row] = FIELD_ROW_HEIGHT
        colCursor += width
      }

      for (const item of items) {
        if (item.type === 'field') {
          if (colCursor + item.width > groupColumns) {
            row++
            colCursor = 0
          }
          placeField(item)
          if (colCursor >= groupColumns) {
            row++
            colCursor = 0
          }
        } else {
          const sub = item as SubGroupLayoutItem
          if (colCursor > 0) {
            row++
            colCursor = 0
          }

          // 子分组标题
          const subHeaderEndCol = sub.width * 2 - 1
          setCell(row, 0, `\u{1F4C2} ${sub.title}`, {
            bold: true,
            fontSize: 12,
            align: 'left',
            verticalAlign: 'middle',
            bgColor: '#F3F4F6',
          })
          if (subHeaderEndCol > 0) {
            merges.push({
              startRow: row,
              endRow: row,
              startCol: 0,
              endCol: subHeaderEndCol,
            })
          }
          rowHeights[row] = GROUP_HEADER_ROW_HEIGHT
          row++

          // 渲染子分组项目
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

              setCell(subRow, labelCol, subItem.fieldName, {
                align: 'right',
                verticalAlign: 'middle',
                textColor: '#666666',
              })

              if (width > 1) {
                const endValueCol = labelCol + width * 2 - 1
                setCell(subRow, valueCol, '', {
                  verticalAlign: 'middle',
                })
                if (endValueCol > valueCol) {
                  merges.push({
                    startRow: subRow,
                    endRow: subRow,
                    startCol: valueCol,
                    endCol: endValueCol,
                  })
                }
              } else {
                setCell(subRow, valueCol, '', {
                  verticalAlign: 'middle',
                })
              }

              rowHeights[subRow] = FIELD_ROW_HEIGHT
              subColCursor += width

              if (subColCursor >= sub.columns) {
                subRow++
                subColCursor = 0
              }
            }
          }

          if (subColCursor > 0) subRow++
          row = subRow
          colCursor = 0
        }
      }

      if (colCursor > 0) row++
      return row
    }

    currentRow = renderItems(group.items, group.columns, currentRow)

    // 分组间分隔行
    if (groupIndex < config.groups.length - 1) {
      rowHeights[currentRow] = EMPTY_ROW_HEIGHT
      currentRow++
    }
  })

  const totalRows = Math.max(currentRow + 1, 50)
  const totalCols = GRID_COLUMNS * 2

  return {
    sheets: [
      {
        name: '表单布局',
        rowCount: totalRows,
        colCount: totalCols,
        cells,
        merges,
        rowHeights,
        colWidths,
        defaultRowHeight: FIELD_ROW_HEIGHT,
        defaultColWidth: VALUE_COL_WIDTH,
      },
    ],
    activeSheetIndex: 0,
  }
}

// ── 转换: ZCellWorkbookData → FormLayoutConfig ──

function zcellDataToConfig(data: ZCellWorkbookData, fields: TableField[]): FormLayoutConfig {
  const groups: FormLayoutGroup[] = []

  for (const sheet of data.sheets) {
    const { cells } = sheet
    if (!cells) continue

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

    // 获取所有行号并排序
    const rowSet = new Set<number>()
    for (const key of Object.keys(cells)) {
      rowSet.add(Number(key.split(',')[0]))
    }
    const rows = [...rowSet].sort((a, b) => a - b)

    for (const row of rows) {
      // 获取该行所有列
      const colSet = new Set<number>()
      for (const key of Object.keys(cells)) {
        const [r, c] = key.split(',').map(Number)
        if (r === row) colSet.add(c)
      }
      const cols = [...colSet].sort((a, b) => a - b)

      for (const col of cols) {
        const cell = cells[`${row},${col}`]
        if (!cell) continue

        const value = cell.value || ''

        // 检测分组标题
        if (value.startsWith('\u{1F4C1} ')) {
          flushRowItems()
          currentSubGroup = null
          const title = value.replace('\u{1F4C1} ', '')
          currentGroup = {
            id: generateId(),
            title,
            columns: 2,
            items: [],
          }
          groups.push(currentGroup)
          // 跳过合并的标题行其余列
          break
        }

        // 检测子分组标题
        if (value.startsWith('\u{1F4C2} ')) {
          flushRowItems()
          const title = value.replace('\u{1F4C2} ', '')
          currentSubGroup = {
            id: generateId(),
            type: 'subgroup',
            title,
            columns: 2,
            width: 1,
            items: [],
          }
          if (currentGroup) {
            currentGroup.items.push(currentSubGroup)
          }
          break
        }

        // 检测字段（label列的文本）
        if (col % 2 === 0 && value && !value.startsWith('\u{1F4C1}') && !value.startsWith('\u{1F4C2}')) {
          const resolvedField = fields.find(f => f.name === value)
          if (resolvedField) {
            const item: FieldLayoutItem = {
              id: generateId(),
              type: 'field',
              fieldId: resolvedField.id,
              fieldName: resolvedField.name,
              width: 1,
            }
            currentRowItems.push(item)
            rowWidthUsed += 1
          }
        }
      }

      if (currentRowItems.length > 0) {
        const containerCols = currentSubGroup?.columns ?? currentGroup?.columns ?? 2
        if (rowWidthUsed >= containerCols) {
          flushRowItems()
        }
      }
    }

    flushRowItems()
  }

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

// ── 组件 ──

export default function ZCellFormDesigner({
  tableId,
  fields,
  initialConfig,
  onSave,
}: ZCellFormDesignerProps) {
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

  const sheetRef = useRef<ZCellSheetEditorHandle>(null)

  // 追踪已使用的字段ID
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

  // 构建初始 ZCell 数据
  const initialWorkbookData = configToZCellData(config, fields)

  // 添加分组
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

  // 字段点击插入
  const handleFieldClick = useCallback((field: TableField) => {
    const sheet = sheetRef.current
    if (!sheet) return

    sheet.insertField(field.name)

    const newFieldItem: FieldLayoutItem = {
      id: generateId(),
      type: 'field',
      fieldId: field.id,
      fieldName: field.name,
      width: 1,
      labelWidth: 100,
    }

    setConfig(prev => {
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

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const data = sheetRef.current?.getData()
      if (data) {
        const reconstructed = zcellDataToConfig(data, fields)
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
      {/* 顶部操作栏 */}
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

      {/* 主布局: 侧边栏 + ZCell 表格 */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 左侧边栏: 可用字段 */}
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

          {/* 分组概览 */}
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

        {/* 右侧: ZCell 表格编辑器 */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0">
              <ZCellSheetEditor
                ref={sheetRef}
                initialData={initialWorkbookData}
                height="calc(100vh - 240px)"
                onDataChange={(data) => {
                  const newConfig = zcellDataToConfig(data, fields)
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