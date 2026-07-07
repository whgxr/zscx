"use client"

import { useState, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Save,
  FolderOpen,
  Maximize2,
  Minimize2,
  Move,
  PanelLeft,
  Type,
} from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { cn } from '@/lib/utils'

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

export interface LegacyFormLayoutFieldConfig {
  fieldId: number
  fieldName: string
  span: 1 | 2
}

export interface LegacyFormLayoutGroup {
  id: string
  title: string
  fields: LegacyFormLayoutFieldConfig[]
}

export interface LegacyFormLayoutConfig {
  groups: LegacyFormLayoutGroup[]
}

interface FormLayoutDesignerProps {
  tableId: number
  fields: TableField[]
  initialConfig?: FormLayoutConfig | LegacyFormLayoutConfig | null
  onSave: (config: FormLayoutConfig) => Promise<void>
}

const fieldTypeIcons: Record<FieldType, string> = {
  TEXT: '📝',
  TEXTAREA: '📄',
  NUMBER: '🔢',
  INTEGER: '🔢',
  FLOAT: '🔢',
  DATE: '📅',
  DATETIME: '📅',
  SELECT: '📋',
  RADIO: '🔘',
  MULTISELECT: '☑️',
  CHECKBOX: '☑️',
  UPLOAD_FILE: '📎',
  UPLOAD_IMAGE: '🖼️',
  PHONE: '📞',
  EMAIL: '📧',
  IDCARD: '🆔',
  ADDRESS: '📍',
  MONEY: '💰',
  SWITCH: '🔄',
  RICHTEXT: '📝',
  RELATION: '🔗',
}

const generateId = () => Math.random().toString(36).substring(2, 11)

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, index) => val === b[index])
}

export default function FormLayoutDesigner({ tableId, fields, initialConfig, onSave }: FormLayoutDesignerProps) {
  const [config, setConfig] = useState<FormLayoutConfig>(() => {
    if (!initialConfig) {
      return { groups: [{ id: generateId(), title: '基本信息', columns: 2, items: [] }] }
    }
    if ('groups' in initialConfig) {
      if (initialConfig.groups.length > 0 && 'fields' in initialConfig.groups[0]) {
        return {
          groups: (initialConfig as LegacyFormLayoutConfig).groups.map(g => ({
            ...g,
            columns: 2,
            items: (g as LegacyFormLayoutGroup).fields.map(f => ({
              id: generateId(),
              type: 'field' as const,
              fieldId: f.fieldId,
              fieldName: f.fieldName,
              width: f.span,
            })),
          })),
        }
      }
      return initialConfig as FormLayoutConfig
    }
    return { groups: [{ id: generateId(), title: '基本信息', columns: 2, items: [] }] }
  })

  const [saving, setSaving] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [dragging, setDragging] = useState<{
    sourcePath: string[]
    sourceIndex: number
    itemType: 'field' | 'subgroup'
    fieldId?: number
    fieldName?: string
    itemId?: string
    width?: number
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    groupId: string
    path: string[]
    index: number
  } | null>(null)

  const unassignedFields = fields.filter(field => {
    if (!field.showInForm) return false
    const used = config.groups.some(g =>
      g.items.some(item => item.type === 'field' && item.fieldId === field.id)
    )
    return !used
  })

  const getFieldById = (fieldId: number): TableField | undefined => fields.find(f => f.id === fieldId)
  const getFieldByName = (fieldName: string): TableField | undefined => fields.find(f => f.name === fieldName)

  const addGroup = () => {
    const newGroup: FormLayoutGroup = {
      id: generateId(),
      title: `分组 ${config.groups.length + 1}`,
      columns: 2,
      items: [],
    }
    setConfig(prev => ({ ...prev, groups: [...prev.groups, newGroup] }))
  }

  const removeGroup = (index: number) => {
    if (config.groups.length <= 1) return
    setConfig(prev => ({ ...prev, groups: prev.groups.filter((_, i) => i !== index) }))
  }

  const reorderGroups = (index: number, direction: 'up' | 'down') => {
    const newGroups = [...config.groups]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newGroups.length) return
    ;[newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]]
    setConfig({ ...config, groups: newGroups })
  }

  const addSubGroup = (groupId: string, path: string[]) => {
    const newSubGroup: SubGroupLayoutItem = {
      id: generateId(),
      type: 'subgroup',
      title: '子分组',
      columns: 2,
      width: 1,
      items: [],
    }
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        return { ...g, items: insertItemAtPath(g.items, path, g.items.length, newSubGroup) }
      }),
    }))
  }

  const handleDragStart = (e: React.DragEvent, data: typeof dragging) => {
    setDragging(data)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    setDragging(null)
    setDropTarget(null)
  }

  const handleDragOver = (e: React.DragEvent, groupId: string, path: string[], index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ groupId, path, index })
  }

  const handleDrop = (e: React.DragEvent, targetGroupId: string, targetPath: string[], targetIndex: number) => {
    e.preventDefault()
    setDropTarget(null)

    if (!dragging) return

    setConfig(prev => {
      let newConfig = { ...prev }
      let movedItem: LayoutItem | null = null

      if (dragging.sourcePath.length >= 1) {
        const sourceGroupId = dragging.sourcePath[0]
        const sourceSubPath = dragging.sourcePath.slice(1)
        const sourceIndex = dragging.sourceIndex

        newConfig = {
          ...newConfig,
          groups: newConfig.groups.map(g => {
            if (g.id !== sourceGroupId) return g
            const sourceItems = getItemsAtPath(g.items, sourceSubPath)
            const newSourceItems = [...sourceItems]
            const [removed] = newSourceItems.splice(sourceIndex, 1)
            if (!removed) return g
            movedItem = removed
            return { ...g, items: updateItemsAtPath(g.items, sourceSubPath, () => newSourceItems) }
          }),
        }
      } else {
        movedItem = {
          id: generateId(),
          type: 'field',
          fieldId: dragging.fieldId!,
          fieldName: dragging.fieldName!,
          width: dragging.width || 1,
        }
      }

      if (movedItem) {
        newConfig = {
          ...newConfig,
          groups: newConfig.groups.map(g => {
            if (g.id !== targetGroupId) return g
            return { ...g, items: insertItemAtPath(g.items, targetPath, targetIndex, movedItem!) }
          }),
        }
      }

      return newConfig
    })

    setDragging(null)
  }

  function getItemsAtPath(items: LayoutItem[], path: string[]): LayoutItem[] {
    if (path.length === 0) return items
    const [head, ...rest] = path
    const found = items.find(item => item.type === 'subgroup' && item.id === head)
    if (found && found.type === 'subgroup') {
      return getItemsAtPath(found.items, rest)
    }
    return items
  }

  const handleRemoveItem = (groupId: string, path: string[], itemId: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        return { ...g, items: removeItemById(g.items, path, itemId) }
      }),
    }))
  }

  const handleWidthChange = (groupId: string, itemId: string, delta: number) => {
    setConfig(prev => {
      const group = prev.groups.find(g => g.id === groupId)
      if (!group) return prev
      const findContainer = (items: LayoutItem[], path: string[]): { container: FormLayoutGroup | SubGroupLayoutItem; currentWidth: number } | null => {
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          if (it.id === itemId) {
            if (path.length === 0) return { container: group, currentWidth: it.width }
            const found = getContainerById(group, path)
            if (found) return { container: found, currentWidth: it.width }
            return null
          }
          if (it.type === 'subgroup') {
            const sub = findContainer(it.items, [...path, it.id])
            if (sub) return sub
          }
        }
        return null
      }
      const result = findContainer(group.items, [])
      if (!result) return prev
      const maxWidth = result.container.columns || 1
      const newWidth = Math.max(1, Math.min(maxWidth, result.currentWidth + delta))
      return {
        ...prev,
        groups: prev.groups.map(g => (g.id === groupId ? { ...g, items: updateItemWidth(g.items, itemId, newWidth) } : g)),
      }
    })
  }

  function getContainerById(group: FormLayoutGroup, path: string[]): SubGroupLayoutItem | null {
    let current: LayoutItem[] = group.items
    for (const id of path) {
      const found = current.find(item => item.type === 'subgroup' && item.id === id)
      if (!found || found.type !== 'subgroup') return null
      current = found.items
    }
    const lastId = path[path.length - 1]
    const found = group.items.find(item => item.type === 'subgroup' && item.id === lastId)
    return found && found.type === 'subgroup' ? found : null
  }

  const handleLabelWidthChange = (groupId: string, itemId: string, delta: number) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        const updateLabelWidth = (items: LayoutItem[]): LayoutItem[] => {
          return items.map(item => {
            if (item.id === itemId && item.type === 'field') {
              const currentLabelWidth = item.labelWidth || 100
              const newLabelWidth = Math.max(60, Math.min(300, currentLabelWidth + delta))
              return { ...item, labelWidth: newLabelWidth }
            }
            if (item.type === 'subgroup') {
              return { ...item, items: updateLabelWidth(item.items) }
            }
            return item
          })
        }
        return { ...g, items: updateLabelWidth(g.items) }
      }),
    }))
  }

  function updateItemWidth(items: LayoutItem[], itemId: string, newWidth: number): LayoutItem[] {
    return items.map(item => {
      if (item.id === itemId) {
        return { ...item, width: newWidth }
      }
      if (item.type === 'subgroup') {
        return { ...item, items: updateItemWidth(item.items, itemId, newWidth) }
      }
      return item
    })
  }

  function removeItemById(items: LayoutItem[], path: string[], itemId: string): LayoutItem[] {
    if (path.length === 0) {
      return items.filter(item => item.id !== itemId)
    }
    const [head, ...rest] = path
    return items.map(item => {
      if (item.type === 'subgroup' && item.id === head) {
        return { ...item, items: removeItemById(item.items, rest, itemId) }
      }
      return item
    })
  }

  function insertItemAtPath(items: LayoutItem[], path: string[], index: number, newItem: LayoutItem): LayoutItem[] {
    if (path.length === 0) {
      const newItems = [...items]
      newItems.splice(index, 0, newItem)
      return newItems
    }
    const [head, ...rest] = path
    return items.map(item => {
      if (item.type === 'subgroup' && item.id === head) {
        return { ...item, items: insertItemAtPath(item.items, rest, index, newItem) }
      }
      return item
    })
  }

  function updateItemsAtPath(items: LayoutItem[], path: string[], updater: (items: LayoutItem[]) => LayoutItem[]): LayoutItem[] {
    if (path.length === 0) {
      return updater(items)
    }
    const [head, ...rest] = path
    return items.map(item => {
      if (item.type === 'subgroup' && item.id === head) {
        return { ...item, items: updateItemsAtPath(item.items, rest, updater) }
      }
      return item
    })
  }

  const handleSubGroupTitleChange = (groupId: string, subGroupId: string, title: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        const updateTitle = (items: LayoutItem[]): LayoutItem[] => {
          return items.map(item => {
            if (item.id === subGroupId && item.type === 'subgroup') {
              return { ...item, title }
            }
            if (item.type === 'subgroup') {
              return { ...item, items: updateTitle(item.items) }
            }
            return item
          })
        }
        return { ...g, items: updateTitle(g.items) }
      }),
    }))
  }

  const handleSubGroupColumnsChange = (groupId: string, subGroupId: string, columns: number) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        const updateCols = (items: LayoutItem[]): LayoutItem[] => {
          return items.map(item => {
            if (item.id === subGroupId && item.type === 'subgroup') {
              return { ...item, columns }
            }
            if (item.type === 'subgroup') {
              return { ...item, items: updateCols(item.items) }
            }
            return item
          })
        }
        return { ...g, items: updateCols(g.items) }
      }),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(config)
    } finally {
      setSaving(false)
    }
  }

  const renderFieldCard = (
    field: TableField,
    item: FieldLayoutItem,
    groupId: string,
    path: string[],
    index: number,
    isSub: boolean = false
  ) => {
    const isDragging = dragging?.itemId === item.id
    const labelW = item.labelWidth || 100
    const fieldW = item.width || 1

    return (
      <div
        key={item.id}
        draggable
        onDragStart={e =>
          handleDragStart(e, {
            sourcePath: [groupId, ...path],
            sourceIndex: index,
            itemType: 'field',
            fieldId: item.fieldId,
            fieldName: item.fieldName,
            itemId: item.id,
            width: item.width,
          })
        }
        onDragEnd={handleDragEnd}
        onDragOver={e => handleDragOver(e, groupId, path, index)}
        onDrop={e => handleDrop(e, groupId, path, index)}
        className={cn(
          'border rounded-lg cursor-grab active:cursor-grabbing transition-all',
          isDragging ? 'opacity-30' : 'hover:border-primary/50 hover:shadow-sm',
          isSub ? 'bg-gray-50' : 'bg-white'
        )}
        style={{
          gridColumn: fieldW > 1 ? `span ${fieldW}` : undefined,
          minWidth: '140px',
        }}
      >
        <div className="p-2 border-b bg-gray-50/50">
          <div className="flex items-center gap-2">
            <GripVertical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-base flex-shrink-0">{fieldTypeIcons[field.type]}</span>
            <div className="font-medium text-xs truncate flex-1">{field.label}</div>
            {field.required && <span className="text-red-500 text-xs flex-shrink-0">*</span>}
          </div>
        </div>
        <div className="p-2 flex items-start gap-2">
          <div
            className="flex-shrink-0 text-right text-xs text-gray-600 leading-7 truncate"
            style={{ width: `${labelW}px`, minWidth: `${labelW}px` }}
          >
            {field.label}{field.required && <span className="text-red-500">*</span>}
          </div>
          <div className="flex-1 min-w-0 h-7 bg-white border border-dashed border-gray-300 rounded px-2 text-[10px] text-gray-400 flex items-center">
            {field.placeholder || `请输入${field.label}`}
          </div>
        </div>
        <div className="px-2 py-1.5 flex items-center gap-1 border-t bg-gray-50/30 flex-wrap">
          <Badge variant="outline" className="text-[10px] h-4 px-1 bg-white">
            {fieldW > 1 ? `${fieldW}列` : '1列'}
          </Badge>
          <div className="flex items-center gap-0.5 bg-white border rounded px-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => handleWidthChange(groupId, item.id, -1)}
              disabled={fieldW <= 1}
            >
              <Minimize2 className="w-2.5 h-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => handleWidthChange(groupId, item.id, 1)}
              disabled={fieldW >= 6}
            >
              <Maximize2 className="w-2.5 h-2.5" />
            </Button>
          </div>
          <div className="flex items-center gap-0.5 bg-white border rounded px-1">
            <Type className="w-2.5 h-2.5 text-gray-500" />
            <button
              onClick={() => handleLabelWidthChange(groupId, item.id, -10)}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-[10px] font-bold"
            >-</button>
            <span className="text-[10px] font-medium text-gray-600 w-8 text-center">{labelW}px</span>
            <button
              onClick={() => handleLabelWidthChange(groupId, item.id, 10)}
              className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-[10px] font-bold"
            >+</button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 text-red-500 hover:text-red-600 ml-auto"
            onClick={() => handleRemoveItem(groupId, path, item.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>
    )
  }

  const renderSubGroup = (
    item: SubGroupLayoutItem,
    groupId: string,
    path: string[],
    index: number,
    depth: number = 0
  ) => {
    const isDragging = dragging?.itemId === item.id
    const newPath = [...path, item.id]

    return (
      <div
        key={item.id}
        draggable
        onDragStart={e =>
          handleDragStart(e, {
            sourcePath: [groupId, ...path],
            sourceIndex: index,
            itemType: 'subgroup',
            itemId: item.id,
            width: item.width,
          })
        }
        onDragEnd={handleDragEnd}
        onDragOver={e => handleDragOver(e, groupId, path, index)}
        onDrop={e => handleDrop(e, groupId, path, index)}
        className={cn(
          'border rounded-lg cursor-grab active:cursor-grabbing transition-all',
          isDragging ? 'opacity-30' : 'hover:border-primary/50 hover:shadow-sm',
          depth > 0 && 'bg-white border-l-4 border-l-amber-400'
        )}
        style={{
          gridColumn: item.width > 1 ? `span ${item.width}` : undefined,
          minWidth: '200px',
        }}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-gray-100/60 rounded-t-lg">
          <GripVertical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <FolderOpen className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <Input
            value={item.title}
            onChange={e => handleSubGroupTitleChange(groupId, item.id, e.target.value)}
            className="h-7 text-sm font-medium bg-transparent border-0 px-1 focus-visible:ring-1"
          />
          <Badge variant="outline" className="text-[10px] h-5 px-1 flex-shrink-0">
            {item.columns}列
          </Badge>
          <div className="flex items-center gap-0.5 bg-white border rounded px-1">
            <button
              onClick={() => {
                const newCols = Math.max(1, item.columns - 1)
                handleSubGroupColumnsChange(groupId, item.id, newCols)
              }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-xs font-bold"
            >-</button>
            <button
              onClick={() => {
                const newCols = Math.min(6, item.columns + 1)
                handleSubGroupColumnsChange(groupId, item.id, newCols)
              }}
              className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-xs font-bold"
            >+</button>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handleWidthChange(groupId, item.id, -1)}
              disabled={item.width <= 1}
            >
              <Minimize2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => handleWidthChange(groupId, item.id, 1)}
              disabled={item.width >= 12}
            >
              <Maximize2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
              onClick={() => handleRemoveItem(groupId, path, item.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        <div className="p-3">
          <div
            className="min-h-[60px] gap-3"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${item.columns}, minmax(0, 1fr))`,
            }}
          >
            {item.items.length === 0 ? (
              <div
                className="col-span-full text-center py-6 text-gray-400 text-xs border-2 border-dashed border-gray-200 rounded-lg hover:border-primary/30 hover:bg-primary/5 transition-colors"
                onDragOver={e => handleDragOver(e, groupId, newPath, 0)}
                onDrop={e => handleDrop(e, groupId, newPath, 0)}
              >
                <Move className="w-4 h-4 mx-auto mb-1 opacity-50" />
                拖拽字段到这里
              </div>
            ) : (
              <>
                {item.items.map((childItem, childIndex) => {
                  const isChildDragging = dragging?.itemId === childItem.id
                  return (
                    <Fragment key={`sub-item-${childItem.id}`}>
                      {isChildDragging ? (
                        <div
                          className="h-16 rounded border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center text-xs text-primary opacity-50"
                          style={{ gridColumn: childItem.width > 1 ? `span ${childItem.width}` : undefined }}
                        >
                          拖动中...
                        </div>
                      ) : childItem.type === 'field' ? (
                        (() => {
                          const field = getFieldById(childItem.fieldId)
                          if (!field) return null
                          return renderFieldCard(field, childItem, groupId, newPath, childIndex, true)
                        })()
                      ) : (
                        renderSubGroup(childItem, groupId, newPath, childIndex, depth + 1)
                      )}
                    </Fragment>
                  )
                })}
              </>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 text-xs text-gray-500 hover:text-primary"
            onClick={() => addSubGroup(groupId, newPath)}
          >
            <Plus className="w-3 h-3 mr-1" />
            添加内部分组
          </Button>
        </div>
      </div>
    )
  }

  const renderGroup = (group: FormLayoutGroup, index: number) => {
    const isExpanded = expandedGroups[group.id] !== false
    const groupPath: string[] = []

    return (
      <Card key={group.id} className="mb-4">
        <CardHeader className="pb-3 cursor-pointer" onClick={() => setExpandedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={e => {
                  e.stopPropagation()
                  setExpandedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <Input
                value={group.title}
                onChange={e => setConfig(prev => ({
                  ...prev,
                  groups: prev.groups.map(g => (g.id === group.id ? { ...g, title: e.target.value } : g)),
                }))}
                className="h-8 text-sm font-medium bg-transparent border-0 px-1 focus-visible:ring-1 w-32"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {group.items.length} 个元素
              </Badge>
              <Badge variant="outline" className="text-xs">
                {group.columns} 列
              </Badge>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    const newCols = Math.max(1, group.columns - 1)
                    setConfig(prev => ({
                      ...prev,
                      groups: prev.groups.map(g => (g.id === group.id ? { ...g, columns: newCols } : g)),
                    }))
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-sm font-bold"
                >-</button>
                <button
                  onClick={() => {
                    const newCols = Math.min(6, group.columns + 1)
                    setConfig(prev => ({
                      ...prev,
                      groups: prev.groups.map(g => (g.id === group.id ? { ...g, columns: newCols } : g)),
                    }))
                  }}
                  className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-sm font-bold"
                >+</button>
              </div>
              <button
                onClick={() => reorderGroups(index, 'up')}
                disabled={index === 0}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => reorderGroups(index, 'down')}
                disabled={index === config.groups.length - 1}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeGroup(index)}
                disabled={config.groups.length <= 1}
                className="w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0">
            <div
              className="gap-3"
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))`,
              }}
            >
              {group.items.length === 0 ? (
                <div
                  className="col-span-full text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-lg hover:border-primary/30 hover:bg-primary/5 transition-colors"
                  onDragOver={e => handleDragOver(e, group.id, groupPath, 0)}
                  onDrop={e => handleDrop(e, group.id, groupPath, 0)}
                >
                  <Move className="w-6 h-6 mx-auto mb-2 opacity-50" />
                  拖拽字段到这里开始布局
                </div>
              ) : (
                <>
                  {group.items.map((item, itemIndex) => {
                    const isItemDragging = dragging?.itemId === item.id
                    return (
                      <Fragment key={`group-item-${item.id}`}>
                        {isItemDragging ? (
                          <div
                            className="h-20 rounded border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center text-xs text-primary opacity-50"
                            style={{ gridColumn: item.width > 1 ? `span ${item.width}` : undefined }}
                          >
                            拖动中...
                          </div>
                        ) : item.type === 'field' ? (
                          (() => {
                            const field = getFieldById(item.fieldId)
                            if (!field) return null
                            return renderFieldCard(field, item, group.id, groupPath, itemIndex)
                          })()
                        ) : (
                          renderSubGroup(item, group.id, groupPath, itemIndex)
                        )}
                      </Fragment>
                    )
                  })}
                </>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => addSubGroup(group.id, [])}
              >
                <FolderOpen className="w-3.5 h-3.5 mr-1" />
                添加子分组
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">表单布局设计</h2>
          <p className="text-sm text-gray-500 mt-1">
            拖拽字段自由排列，支持多级嵌套分组和自定义列数（1-6列）
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

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
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
              <div
                className={cn(
                  'space-y-2 min-h-[200px] p-2 border-2 border-dashed rounded-lg transition-colors',
                  dragging && dragging.sourcePath.length > 0
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-gray-200'
                )}
                onDragOver={e => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={e => {
                  e.preventDefault()
                  if (!dragging || dragging.sourcePath.length === 0) return
                  setConfig(prev => ({
                    ...prev,
                    groups: prev.groups.map(g => {
                      if (g.id !== dragging.sourcePath[0]) return g
                      const sourceSubPath = dragging.sourcePath.slice(1)
                      const sourceItems = getItemsAtPath(g.items, sourceSubPath)
                      const newSourceItems = [...sourceItems]
                      newSourceItems.splice(dragging.sourceIndex, 1)
                      return { ...g, items: updateItemsAtPath(g.items, sourceSubPath, () => newSourceItems) }
                    }),
                  }))
                  setDragging(null)
                }}
              >
                {unassignedFields.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    所有字段已分配
                  </div>
                ) : (
                  unassignedFields.map(field => (
                    <div
                      key={field.id}
                      draggable
                      onDragStart={e =>
                        handleDragStart(e, {
                          sourcePath: [],
                          sourceIndex: 0,
                          itemType: 'field',
                          fieldId: field.id,
                          fieldName: field.name,
                          width: 1,
                        })
                      }
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-2 p-2 bg-white border rounded-lg cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all"
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
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3">
          {config.groups.map((group, index) => renderGroup(group, index))}
        </div>
      </div>
    </div>
  )
}