"use client"

import { useState, useRef, Fragment } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Save,
  Settings2,
  FolderOpen,
  Maximize2,
  Minimize2,
  Move,
  PanelLeft,
  LayoutGrid,
  Type,
} from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { cn } from '@/lib/utils'

// ============ 新的数据结构 ============

export type LayoutItemType = 'field' | 'subgroup'

export interface BaseLayoutItem {
  id: string
  type: LayoutItemType
  width: number // 1-12，在父级列中占几列
}

export interface FieldLayoutItem extends BaseLayoutItem {
  type: 'field'
  fieldId: number
  fieldName: string
  labelWidth?: number // 标签宽度，像素值
}

export interface SubGroupLayoutItem extends BaseLayoutItem {
  type: 'subgroup'
  title: string
  columns: number // 子分组内的列数
  items: LayoutItem[]
}

export type LayoutItem = FieldLayoutItem | SubGroupLayoutItem

export interface FormLayoutGroup {
  id: string
  title: string
  columns: number // 分组内的列数
  items: LayoutItem[]
}

export interface FormLayoutConfig {
  groups: FormLayoutGroup[]
}

// ============ 兼容旧数据结构 ============

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

// ============ Props ============

interface FormLayoutDesignerProps {
  tableId: number
  fields: TableField[]
  initialConfig?: FormLayoutConfig | LegacyFormLayoutConfig | null
  onSave: (config: FormLayoutConfig) => Promise<void>
}

// ============ 工具函数 ============

const fieldTypeIcons: Record<FieldType, string> = {
  TEXT: '📝',
  TEXTAREA: '📄',
  NUMBER: '🔢',
  INTEGER: '🔢',
  FLOAT: '🔢',
  DATE: '📅',
  DATETIME: '🕐',
  SELECT: '📋',
  RADIO: '🔘',
  MULTISELECT: '☑️',
  CHECKBOX: '☑️',
  UPLOAD_IMAGE: '🖼️',
  UPLOAD_FILE: '📁',
  PHONE: '📱',
  EMAIL: '📧',
  IDCARD: '🪪',
  ADDRESS: '📍',
  MONEY: '💰',
  SWITCH: '🔀',
  RICHTEXT: '📝',
  RELATION: '🔗',
}

function generateId() {
  return Math.random().toString(36).substring(2, 11)
}

/** 检测是否是旧版配置 */
function isLegacyConfig(config: any): config is LegacyFormLayoutConfig {
  if (!config || !config.groups) return false
  return config.groups.some((g: any) => Array.isArray(g.fields))
}

/** 旧版配置转新版 */
function migrateLegacyConfig(legacy: LegacyFormLayoutConfig): FormLayoutConfig {
  return {
    groups: legacy.groups.map(g => ({
      id: g.id,
      title: g.title,
      columns: 2,
      items: g.fields.map(f => ({
        id: generateId(),
        type: 'field' as const,
        fieldId: f.fieldId,
        fieldName: f.fieldName,
        width: f.span === 2 ? 2 : 1,
      })),
    })),
  }
}

function getDefaultConfig(fields: TableField[]): FormLayoutConfig {
  const formFields = fields.filter(f => f.showInForm)
  return {
    groups: [
      {
        id: generateId(),
        title: '基本信息',
        columns: 2,
        items: formFields.map(f => ({
          id: generateId(),
          type: 'field' as const,
          fieldId: f.id,
          fieldName: f.name,
          width: 1,
        })),
      },
    ],
  }
}

/** 从配置中收集所有已分配的字段ID */
function collectAssignedFieldIds(items: LayoutItem[]): Set<number> {
  const ids = new Set<number>()
  for (const item of items) {
    if (item.type === 'field') {
      ids.add(item.fieldId)
    } else {
      for (const id of collectAssignedFieldIds(item.items)) {
        ids.add(id)
      }
    }
  }
  return ids
}

/** 在 items 树中指定路径插入字段 */
function insertItemAtPath(
  items: LayoutItem[],
  path: string[],
  insertIndex: number,
  newItem: LayoutItem
): LayoutItem[] {
  if (path.length === 0) {
    const result = [...items]
    result.splice(insertIndex, 0, newItem)
    return result
  }

  const [head, ...rest] = path
  return items.map(item => {
    if (item.type === 'subgroup' && item.id === head) {
      return { ...item, items: insertItemAtPath(item.items, rest, insertIndex, newItem) }
    }
    return item
  })
}

/** 在 items 树中指定路径删除指定id的项 */
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

/** 更新 items 树中指定路径的 items */
function updateItemsAtPath(
  items: LayoutItem[],
  path: string[],
  updater: (items: LayoutItem[]) => LayoutItem[]
): LayoutItem[] {
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

/** 更新 items 中某个项的宽度 */
function updateItemWidth(items: LayoutItem[], itemId: string, width: number): LayoutItem[] {
  return items.map(item => {
    if (item.id === itemId) {
      return { ...item, width }
    }
    if (item.type === 'subgroup') {
      return { ...item, items: updateItemWidth(item.items, itemId, width) }
    }
    return item
  })
}

/** 更新子分组标题 */
function updateSubGroupTitle(items: LayoutItem[], itemId: string, title: string): LayoutItem[] {
  return items.map(item => {
    if (item.id === itemId && item.type === 'subgroup') {
      return { ...item, title }
    }
    if (item.type === 'subgroup') {
      return { ...item, items: updateSubGroupTitle(item.items, itemId, title) }
    }
    return item
  })
}

/** 更新子分组列数 */
function updateSubGroupColumns(items: LayoutItem[], itemId: string, columns: number): LayoutItem[] {
  return items.map(item => {
    if (item.id === itemId && item.type === 'subgroup') {
      return { ...item, columns }
    }
    if (item.type === 'subgroup') {
      return { ...item, items: updateSubGroupColumns(item.items, itemId, columns) }
    }
    return item
  })
}

// ============ 拖拽类型 ============

interface DragData {
  sourcePath: string[]
  sourceIndex: number
  itemType: 'field' | 'subgroup'
  fieldId?: number
  fieldName?: string
  itemId?: string
  width?: number
}

// ============ 主组件 ============

export function FormLayoutDesigner({ tableId, fields, initialConfig, onSave }: FormLayoutDesignerProps) {
  const formFields = fields.filter(f => f.showInForm)

  const [config, setConfig] = useState<FormLayoutConfig>(() => {
    if (initialConfig && initialConfig.groups && initialConfig.groups.length > 0) {
      if (isLegacyConfig(initialConfig)) {
        return migrateLegacyConfig(initialConfig)
      }
      return initialConfig as FormLayoutConfig
    }
    return getDefaultConfig(fields)
  })

  const [saving, setSaving] = useState(false)

  const [dragging, setDragging] = useState<DragData | null>(null)
  const [dropTarget, setDropTarget] = useState<{
    groupId: string
    path: string[]
    index: number
    column?: number
  } | null>(null)

  const getUnassignedFields = (): TableField[] => {
    const assignedFieldIds = new Set<number>()
    for (const group of config.groups) {
      for (const id of collectAssignedFieldIds(group.items)) {
        assignedFieldIds.add(id)
      }
    }
    return formFields.filter(f => !assignedFieldIds.has(f.id))
  }

  const unassignedFields = getUnassignedFields()

  const getFieldById = (fieldId: number) => fields.find(f => f.id === fieldId)

  // ========== 分组操作 ==========

  const addGroup = () => {
    const newGroup: FormLayoutGroup = {
      id: generateId(),
      title: `分组 ${config.groups.length + 1}`,
      columns: 2,
      items: [],
    }
    setConfig({ ...config, groups: [...config.groups, newGroup] })
  }

  const removeGroup = (groupId: string) => {
    if (config.groups.length <= 1) {
      alert('至少保留一个分组')
      return
    }
    if (!confirm('确定要删除这个分组吗？分组内的字段将移到未分配区域。')) return
    setConfig({ ...config, groups: config.groups.filter(g => g.id !== groupId) })
  }

  const updateGroupTitle = (groupId: string, title: string) => {
    setConfig({
      ...config,
      groups: config.groups.map(g => (g.id === groupId ? { ...g, title } : g)),
    })
  }

  const updateGroupColumns = (groupId: string, columns: number) => {
    setConfig({
      ...config,
      groups: config.groups.map(g => (g.id === groupId ? { ...g, columns } : g)),
    })
  }

  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const newGroups = [...config.groups]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newGroups.length) return
    ;[newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]]
    setConfig({ ...config, groups: newGroups })
  }

  // ========== 子分组操作 ==========

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

  // ========== 拖拽处理 ==========

  const handleDragStart = (e: React.DragEvent, data: DragData) => {
    setDragging(data)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify(data))
  }

  const handleDragEnd = () => {
    setDragging(null)
    setDropTarget(null)
  }

  const handleDragOver = (e: React.DragEvent, groupId: string, path: string[], index: number, column?: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropTarget({ groupId, path, index, column })
  }

  const handleDrop = (e: React.DragEvent, targetGroupId: string, targetPath: string[], targetIndex: number, column?: number) => {
    e.preventDefault()
    setDropTarget(null)

    if (!dragging) return

    setConfig(prev => {
      let newConfig = { ...prev }
      let movedItem: LayoutItem | null = null

      // 1. 从源位置移除并获取完整数据
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
            movedItem = removed  // 保存完整数据（子分组的 title/columns/items 都保留）
            return { ...g, items: updateItemsAtPath(g.items, sourceSubPath, () => newSourceItems) }
          }),
        }
      } else {
        // 从左侧未分配区域拖入的新字段
        movedItem = {
          id: generateId(),
          type: 'field',
          fieldId: dragging.fieldId!,
          fieldName: dragging.fieldName!,
          width: dragging.width || 1,
        }
      }

      // 2. 插入到目标位置（保留完整的子分组数据）
      if (movedItem) {
        const itemToInsert = movedItem as LayoutItem
        newConfig = {
          ...newConfig,
          groups: newConfig.groups.map(g => {
            if (g.id !== targetGroupId) return g
            return { ...g, items: insertItemAtPath(g.items, targetPath, targetIndex, itemToInsert) }
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
      // 找到 item 所在容器的 columns 和当前 width
      const findContainer = (items: LayoutItem[], path: string[]): { container: FormLayoutGroup | SubGroupLayoutItem; currentWidth: number } | null => {
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          if (it.id === itemId) {
            // 找到 item，path 是从 group root 到包含它的容器
            if (path.length === 0) return { container: group, currentWidth: it.width }
            // path 的最后一个是子分组 id
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

  const pathToContainer = (groupId: string, path: string[], callback: (path: string[]) => number): number => {
    if (path.length === 0) {
      const group = config.groups.find(g => g.id === groupId)
      return group ? callback(path) : 1
    }
    const [head, ...rest] = path
    const group = config.groups.find(g => g.id === groupId)
    if (!group) return 1
    const findSubGroup = (items: LayoutItem[], subPath: string[]): number => {
      if (subPath.length === 0) return callback(path)
      const [id, ...remaining] = subPath
      const item = items.find(i => i.type === 'subgroup' && i.id === id)
      if (!item || item.type !== 'subgroup') return 1
      return findSubGroup(item.items, remaining)
    }
    return findSubGroup(group.items, path)
  }

  const getContainerById = (group: FormLayoutGroup, path: string[]): FormLayoutGroup | SubGroupLayoutItem | null => {
    if (path.length === 0) return group
    const [head, ...rest] = path
    const item = group.items.find(i => i.type === 'subgroup' && i.id === head)
    if (!item || item.type !== 'subgroup') return null
    if (rest.length === 0) return item
    return getSubGroupContainer(item, rest)
  }

  const getSubGroupContainer = (subgroup: SubGroupLayoutItem, path: string[]): SubGroupLayoutItem | null => {
    if (path.length === 0) return subgroup
    const [head, ...rest] = path
    const item = subgroup.items.find(i => i.type === 'subgroup' && i.id === head)
    if (!item || item.type !== 'subgroup') return null
    if (rest.length === 0) return item
    return getSubGroupContainer(item, rest)
  }

  const handleSubGroupTitleChange = (groupId: string, itemId: string, title: string) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        return { ...g, items: updateSubGroupTitle(g.items, itemId, title) }
      }),
    }))
  }

  const handleSubGroupColumnsChange = (groupId: string, itemId: string, columns: number) => {
    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => {
        if (g.id !== groupId) return g
        return { ...g, items: updateSubGroupColumns(g.items, itemId, columns) }
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

  // ========== 渲染 ==========

  /** 渲染字段拖拽卡片（设计器内的简化版） */
  const renderFieldDesignerCard = (
    field: TableField,
    item: FieldLayoutItem,
    groupId: string,
    path: string[],
    index: number,
    inSubGroup: boolean = false,
    depth: number = 0,
    containerColumns: number = 6
  ) => {
    const isDragging = dragging?.itemId === item.id
    const labelW = item.labelWidth || 100
    const fieldW = item.width || 1

    return (
      <div
        key={item.id}
        className={cn(
          'transition-all duration-150',
          isDragging && 'opacity-30'
        )}
        style={{
          gridColumn: fieldW > 1 ? `span ${fieldW}` : undefined,
          minWidth: '140px',
        }}
      >
        <div
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
          className={cn(
            'border rounded-lg group hover:border-primary/50 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing bg-white',
            inSubGroup && 'bg-gray-50',
            depth > 0 && 'bg-gray-50'
          )}
        >
          {/* 字段预览区 - 所看即所得 */}
          <div className="p-2 border-b bg-gray-50/50">
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
              <span className="text-base flex-shrink-0">{fieldTypeIcons[field.type]}</span>
              <div className="font-medium text-xs truncate flex-1">{field.label}</div>
              {field.required && <span className="text-red-500 text-xs flex-shrink-0">*</span>}
            </div>
          </div>

          {/* 实际标签+输入框预览 - 显示 labelWidth 效果 */}
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

          {/* 控制按钮区 */}
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
                title="减小宽度"
              >
                <Minimize2 className="w-2.5 h-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={() => handleWidthChange(groupId, item.id, 1)}
                disabled={fieldW >= containerColumns || fieldW >= 6}
                title="增大宽度"
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
              title="移除"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
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
    const isDropTarget = dropTarget?.groupId === groupId && arraysEqual(dropTarget.path, path) && dropTarget.index === index
    const newPath = [...path, item.id]

    return (
      <div
        key={item.id}
        className={cn('transition-all duration-150', isDragging && 'opacity-40')}
        style={{
          gridColumn: item.width > 1 ? `span ${item.width}` : undefined,
          minWidth: '200px',
        }}
      >
        {isDropTarget && <div className="h-1 bg-primary rounded-full mb-1" />}

        <div
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
          className={cn(
            'border rounded-lg bg-gray-50/60 group hover:border-primary/50 hover:shadow-sm transition-all',
            depth > 0 && 'bg-white border-l-4 border-l-amber-400'
          )}
        >
          <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-gray-100/60 rounded-t-lg cursor-grab active:cursor-grabbing">
            <GripVertical className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <FolderOpen className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <Input
              value={item.title}
              onChange={e => handleSubGroupTitleChange(groupId, item.id, e.target.value)}
              className="h-7 text-sm font-medium bg-transparent border-0 px-1 focus-visible:ring-1"
            />
            
            <div className="flex items-center gap-1 ml-auto">
              <Badge variant="outline" className="text-[10px] h-5 px-1 flex-shrink-0">
                {item.width > 1 ? `${item.width}列` : ''}
              </Badge>
              
              <div className="flex items-center gap-0.5 bg-white border rounded px-1.5">
                <LayoutGrid className="w-3 h-3 text-gray-500" />
                <button
                  onClick={() => {
                    const newCols = Math.max(1, item.columns - 1)
                    handleSubGroupColumnsChange(groupId, item.id, newCols)
                  }}
                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-xs font-bold"
                >-</button>
                <span className="text-xs font-medium text-gray-600 w-4 text-center">{item.columns}</span>
                <button
                  onClick={() => {
                    const newCols = Math.min(6, item.columns + 1)
                    handleSubGroupColumnsChange(groupId, item.id, newCols)
                  }}
                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-xs font-bold"
                >+</button>
              </div>

              <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleWidthChange(groupId, item.id, -1)}
                  disabled={item.width <= 1}
                  title="减小宽度"
                >
                  <Minimize2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => handleWidthChange(groupId, item.id, 1)}
                  disabled={item.width >= 12}
                  title="增大宽度"
                >
                  <Maximize2 className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
                  onClick={() => handleRemoveItem(groupId, path, item.id)}
                  title="删除子分组"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
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
                    const isSource = dragging?.itemId === childItem.id
                    return (
                      <Fragment key={`sub-item-wrapper-${childItem.id}`}>
                        {/* 左侧放置槽 - 1列宽，所看即所得 */}
                        {dragging && !isSource && (
                          <div
                            className={cn(
                              'h-20 rounded transition-all border-2 border-dashed flex items-center justify-center text-xs',
                              dropTarget?.groupId === groupId &&
                                arraysEqual(dropTarget.path, newPath) &&
                                dropTarget.index === childIndex
                                ? 'border-primary bg-primary/20 text-primary font-medium'
                                : 'border-gray-300 bg-gray-50/50 text-gray-400'
                            )}
                            onDragOver={e => handleDragOver(e, groupId, newPath, childIndex)}
                            onDrop={e => handleDrop(e, groupId, newPath, childIndex)}
                          >
                            {dropTarget?.groupId === groupId &&
                              arraysEqual(dropTarget.path, newPath) &&
                              dropTarget.index === childIndex ? '放置' : ''}
                          </div>
                        )}

                        {/* 字段或子分组 */}
                        {isSource ? (
                          <div
                            className="h-20 rounded border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center text-xs text-primary"
                            style={{
                              gridColumn: childItem.width > 1 ? `span ${childItem.width}` : undefined,
                            }}
                          >
                            拖动中...
                          </div>
                        ) : childItem.type === 'field' ? (
                          (() => {
                            const field = getFieldById(childItem.fieldId)
                            if (!field) return null
                            return renderFieldDesignerCard(field, childItem, groupId, newPath, childIndex, true, depth + 1, item.columns)
                          })()
                        ) : (
                          renderSubGroup(childItem, groupId, newPath, childIndex, depth + 1)
                        )}
                      </Fragment>
                    )
                  })}
                  {/* 末尾放置槽 */}
                  {dragging && (
                    <div
                      className={cn(
                        'h-20 rounded transition-all border-2 border-dashed flex items-center justify-center text-xs',
                        dropTarget?.groupId === groupId &&
                          arraysEqual(dropTarget.path, newPath) &&
                          dropTarget.index === item.items.length
                          ? 'border-primary bg-primary/20 text-primary font-medium'
                          : 'border-gray-300 bg-gray-50/50 text-gray-400'
                      )}
                      onDragOver={e => handleDragOver(e, groupId, newPath, item.items.length)}
                      onDrop={e => handleDrop(e, groupId, newPath, item.items.length)}
                    >
                      {dropTarget?.groupId === groupId &&
                        arraysEqual(dropTarget.path, newPath) &&
                        dropTarget.index === item.items.length ? '放置' : ''}
                    </div>
                  )}
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
      </div>
    )
  }

  const renderGroup = (group: FormLayoutGroup, groupIndex: number) => {
    const groupPath: string[] = []

    return (
      <Card
        key={group.id}
        className={cn(
          'transition-colors overflow-visible',
          dragging && 'hover:border-primary/50'
        )}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => moveGroup(groupIndex, 'up')}
                disabled={groupIndex === 0}
                title="上移分组"
              >
                <ChevronUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => moveGroup(groupIndex, 'down')}
                disabled={groupIndex === config.groups.length - 1}
                title="下移分组"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex-1">
              <Input
                value={group.title}
                onChange={e => updateGroupTitle(group.id, e.target.value)}
                className="font-semibold text-base h-9"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{countItems(group.items)} 个元素</Badge>
              
              <div className="flex items-center gap-0.5 bg-white border rounded px-2 py-1">
                <LayoutGrid className="w-3.5 h-3.5 text-gray-500" />
                <button
                  onClick={() => {
                    const newCols = Math.max(1, group.columns - 1)
                    updateGroupColumns(group.id, newCols)
                  }}
                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-xs font-bold"
                >-</button>
                <span className="text-xs font-medium text-gray-600 w-5 text-center">{group.columns}列</span>
                <button
                  onClick={() => {
                    const newCols = Math.min(6, group.columns + 1)
                    updateGroupColumns(group.id, newCols)
                  }}
                  className="w-5 h-5 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded text-xs font-bold"
                >+</button>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-red-500 hover:text-red-600"
                onClick={() => removeGroup(group.id)}
                title="删除分组"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="min-h-[100px]"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))`,
              gap: '12px',
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
                {group.items.map((item, index) => {
                  const isSource = dragging?.itemId === item.id
                  return (
                    <Fragment key={`item-wrapper-${item.id}`}>
                      {/* 左侧放置槽 - 1列宽，所看即所得 */}
                      {dragging && !isSource && (
                        <div
                          className={cn(
                            'h-24 rounded transition-all border-2 border-dashed flex items-center justify-center text-xs',
                            dropTarget?.groupId === group.id &&
                              arraysEqual(dropTarget.path, groupPath) &&
                              dropTarget.index === index
                              ? 'border-primary bg-primary/20 text-primary font-medium'
                              : 'border-gray-300 bg-gray-50/50 text-gray-400'
                          )}
                          onDragOver={e => handleDragOver(e, group.id, groupPath, index)}
                          onDrop={e => handleDrop(e, group.id, groupPath, index)}
                        >
                          {dropTarget?.groupId === group.id &&
                            arraysEqual(dropTarget.path, groupPath) &&
                            dropTarget.index === index ? '放置' : ''}
                        </div>
                      )}

                      {/* 字段或子分组 */}
                      {isSource ? (
                        <div
                          className="h-24 rounded border-2 border-dashed border-primary/40 bg-primary/5 flex items-center justify-center text-xs text-primary"
                          style={{
                            gridColumn: item.width > 1 ? `span ${item.width}` : undefined,
                          }}
                        >
                          拖动中...
                        </div>
                      ) : item.type === 'field' ? (
                        (() => {
                          const field = getFieldById(item.fieldId)
                          if (!field) return null
                          return renderFieldDesignerCard(field, item, group.id, groupPath, index, false, 0, group.columns)
                        })()
                      ) : (
                        renderSubGroup(item, group.id, groupPath, index)
                      )}
                    </Fragment>
                  )
                })}
                {/* 末尾放置槽 */}
                {dragging && (
                  <div
                    className={cn(
                      'h-24 rounded transition-all border-2 border-dashed flex items-center justify-center text-xs',
                      dropTarget?.groupId === group.id &&
                        arraysEqual(dropTarget.path, groupPath) &&
                        dropTarget.index === group.items.length
                        ? 'border-primary bg-primary/20 text-primary font-medium'
                        : 'border-gray-300 bg-gray-50/50 text-gray-400'
                    )}
                    onDragOver={e => handleDragOver(e, group.id, groupPath, group.items.length)}
                    onDrop={e => handleDrop(e, group.id, groupPath, group.items.length)}
                  >
                    {dropTarget?.groupId === group.id &&
                      arraysEqual(dropTarget.path, groupPath) &&
                      dropTarget.index === group.items.length ? '放置' : ''}
                  </div>
                )}
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
                  const sourceGroupId = dragging.sourcePath[0]
                  const sourceSubPath = dragging.sourcePath.slice(1)
                  setConfig(prev => ({
                    ...prev,
                    groups: prev.groups.map(g => {
                      if (g.id !== sourceGroupId) return g
                      const sourceItems = getItemsAtPath(g.items, sourceSubPath)
                      const newSourceItems = [...sourceItems]
                      newSourceItems.splice(dragging.sourceIndex, 1)
                      return { ...g, items: updateItemsAtPath(g.items, sourceSubPath, () => newSourceItems) }
                    }),
                  }))
                  setDragging(null)
                  setDropTarget(null)
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
                          sourceIndex: -1,
                          itemType: 'field',
                          fieldId: field.id,
                          fieldName: field.name,
                          width: 1,
                        })
                      }
                      onDragEnd={handleDragEnd}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center gap-2 p-2 bg-white border rounded-lg hover:border-primary/50 transition-colors">
                        <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-lg flex-shrink-0">{fieldTypeIcons[field.type]}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{field.label}</div>
                          <div className="text-xs text-gray-500 truncate">{field.name}</div>
                        </div>
                        {field.required && (
                          <Badge variant="destructive" className="text-xs flex-shrink-0">
                            必填
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                使用提示
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-xs text-gray-500 space-y-1.5">
                <li className="flex items-start gap-1.5">
                  <Move className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>拖拽字段到右侧分组中</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <LayoutGrid className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>点击分组右上角 +/- 调整列数（1-6列）</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Maximize2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>悬停字段可跨列（1-6列宽）</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <FolderOpen className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>支持2-3级嵌套子分组</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {config.groups.map((group, index) => renderGroup(group, index))}
        </div>
      </div>
    </div>
  )
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((val, i) => val === b[i])
}

function countItems(items: LayoutItem[]): number {
  let count = 0
  for (const item of items) {
    if (item.type === 'field') {
      count++
    } else {
      count += 1 + countItems(item.items)
    }
  }
  return count
}
