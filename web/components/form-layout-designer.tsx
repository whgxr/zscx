"use client"

import { useState } from 'react'
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
  LayoutGrid,
  Columns2,
  Save,
  Settings2,
} from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { cn } from '@/lib/utils'

export interface FormLayoutFieldConfig {
  fieldId: number
  fieldName: string
  span: 1 | 2
}

export interface FormLayoutGroup {
  id: string
  title: string
  fields: FormLayoutFieldConfig[]
}

export interface FormLayoutConfig {
  groups: FormLayoutGroup[]
}

interface FormLayoutDesignerProps {
  tableId: number
  fields: TableField[]
  initialConfig?: FormLayoutConfig | null
  onSave: (config: FormLayoutConfig) => Promise<void>
}

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

function getDefaultConfig(fields: TableField[]): FormLayoutConfig {
  const formFields = fields.filter(f => f.showInForm)
  return {
    groups: [
      {
        id: generateId(),
        title: '基本信息',
        fields: formFields.map(f => ({
          fieldId: f.id,
          fieldName: f.name,
          span: 1 as const,
        })),
      },
    ],
  }
}

export function FormLayoutDesigner({ tableId, fields, initialConfig, onSave }: FormLayoutDesignerProps) {
  const formFields = fields.filter(f => f.showInForm)

  const [config, setConfig] = useState<FormLayoutConfig>(() => {
    if (initialConfig && initialConfig.groups && initialConfig.groups.length > 0) {
      return initialConfig
    }
    return getDefaultConfig(fields)
  })

  const [saving, setSaving] = useState(false)
  const [draggedField, setDraggedField] = useState<{
    field: TableField
    source: 'unassigned' | { groupId: string; index: number }
  } | null>(null)

  const getUnassignedFields = (): TableField[] => {
    const assignedFieldIds = new Set<number>()
    config.groups.forEach(group => {
      group.fields.forEach(f => assignedFieldIds.add(f.fieldId))
    })
    return formFields.filter(f => !assignedFieldIds.has(f.id))
  }

  const unassignedFields = getUnassignedFields()

  const addGroup = () => {
    const newGroup: FormLayoutGroup = {
      id: generateId(),
      title: `分组 ${config.groups.length + 1}`,
      fields: [],
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
      groups: config.groups.map(g =>
        g.id === groupId ? { ...g, title } : g
      ),
    })
  }

  const moveGroup = (index: number, direction: 'up' | 'down') => {
    const newGroups = [...config.groups]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newGroups.length) return
    ;[newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]]
    setConfig({ ...config, groups: newGroups })
  }

  const toggleFieldSpan = (groupId: string, fieldIndex: number) => {
    setConfig({
      ...config,
      groups: config.groups.map(g => {
        if (g.id !== groupId) return g
        return {
          ...g,
          fields: g.fields.map((f, i) =>
            i === fieldIndex ? { ...f, span: f.span === 1 ? 2 : 1 } : f
          ),
        }
      }),
    })
  }

  const removeFieldFromGroup = (groupId: string, fieldIndex: number) => {
    setConfig({
      ...config,
      groups: config.groups.map(g => {
        if (g.id !== groupId) return g
        return {
          ...g,
          fields: g.fields.filter((_, i) => i !== fieldIndex),
        }
      }),
    })
  }

  const moveFieldInGroup = (groupId: string, index: number, direction: 'up' | 'down') => {
    const group = config.groups.find(g => g.id === groupId)
    if (!group) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= group.fields.length) return

    const newFields = [...group.fields]
    ;[newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]]

    setConfig({
      ...config,
      groups: config.groups.map(g =>
        g.id === groupId ? { ...g, fields: newFields } : g
      ),
    })
  }

  const handleDragStart = (
    e: React.DragEvent,
    field: TableField,
    source: 'unassigned' | { groupId: string; index: number }
  ) => {
    setDraggedField({ field, source })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDropOnGroup = (e: React.DragEvent, groupId: string, dropIndex?: number) => {
    e.preventDefault()
    if (!draggedField) return

    const fieldConfig: FormLayoutFieldConfig = {
      fieldId: draggedField.field.id,
      fieldName: draggedField.field.name,
      span: 1,
    }

    setConfig(prev => {
      let newGroups = [...prev.groups]
      const source = draggedField.source

      if (source !== 'unassigned') {
        const sourceGroupIndex = newGroups.findIndex(g => g.id === source.groupId)
        if (sourceGroupIndex !== -1) {
          newGroups[sourceGroupIndex] = {
            ...newGroups[sourceGroupIndex],
            fields: newGroups[sourceGroupIndex].fields.filter(
              (_, i) => i !== source.index
            ),
          }
        }
      }

      const targetGroupIndex = newGroups.findIndex(g => g.id === groupId)
      if (targetGroupIndex !== -1) {
        const newFields = [...newGroups[targetGroupIndex].fields]
        const insertIndex = dropIndex !== undefined ? dropIndex : newFields.length
        newFields.splice(insertIndex, 0, fieldConfig)
        newGroups[targetGroupIndex] = {
          ...newGroups[targetGroupIndex],
          fields: newFields,
        }
      }

      return { ...prev, groups: newGroups }
    })

    setDraggedField(null)
  }

  const handleDropOnUnassigned = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedField || draggedField.source === 'unassigned') return

    setConfig(prev => ({
      ...prev,
      groups: prev.groups.map(g => ({
        ...g,
        fields: g.fields.filter(f => f.fieldId !== draggedField.field.id),
      })),
    }))

    setDraggedField(null)
  }

  const handleDragEnd = () => {
    setDraggedField(null)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(config)
    } finally {
      setSaving(false)
    }
  }

  const getFieldById = (fieldId: number) => fields.find(f => f.id === fieldId)

  const FieldCard = ({
    field,
    span,
    onToggleSpan,
    onRemove,
    onMoveUp,
    onMoveDown,
    showMoveButtons = true,
  }: {
    field: TableField
    span?: 1 | 2
    onToggleSpan?: () => void
    onRemove?: () => void
    onMoveUp?: () => void
    onMoveDown?: () => void
    showMoveButtons?: boolean
  }) => (
    <div
      className={cn(
        "flex items-center gap-2 p-2 bg-white border rounded-lg group hover:border-primary/50 transition-colors",
        span === 2 && "col-span-2"
      )}
    >
      <GripVertical className="w-4 h-4 text-gray-400 cursor-grab flex-shrink-0" />
      <span className="text-lg flex-shrink-0">{fieldTypeIcons[field.type]}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{field.label}</div>
        <div className="text-xs text-gray-500 truncate">{field.name}</div>
      </div>
      {field.required && (
        <Badge variant="destructive" className="text-xs flex-shrink-0">必填</Badge>
      )}
      {onToggleSpan && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onToggleSpan}
          title={span === 1 ? '设为全宽' : '设为半宽'}
        >
          {span === 1 ? <Columns2 className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </Button>
      )}
      {showMoveButtons && onMoveUp && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onMoveUp}
          title="上移"
        >
          <ChevronUp className="w-4 h-4" />
        </Button>
      )}
      {showMoveButtons && onMoveDown && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onMoveDown}
          title="下移"
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      )}
      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 flex-shrink-0 text-red-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onRemove}
          title="移除"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">表单布局设计</h2>
          <p className="text-sm text-gray-500 mt-1">
            拖拽字段到分组中，调整顺序和列宽
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
                <Settings2 className="w-4 h-4" />
                未分配字段
                <Badge variant="secondary" className="ml-auto">
                  {unassignedFields.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={cn(
                  "space-y-2 min-h-[200px] p-2 border-2 border-dashed rounded-lg transition-colors",
                  draggedField && draggedField.source !== 'unassigned'
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-gray-200'
                )}
                onDragOver={handleDragOver}
                onDrop={handleDropOnUnassigned}
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
                      onDragStart={e => handleDragStart(e, field, 'unassigned')}
                      onDragEnd={handleDragEnd}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <FieldCard field={field} showMoveButtons={false} />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {config.groups.map((group, groupIndex) => (
            <Card
              key={group.id}
              className={cn(
                "transition-colors",
                draggedField && "hover:border-primary/50"
              )}
              onDragOver={handleDragOver}
              onDrop={e => handleDropOnGroup(e, group.id)}
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
                  <Badge variant="secondary">
                    {group.fields.length} 个字段
                  </Badge>
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
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 min-h-[100px] p-2">
                  {group.fields.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-gray-400 text-sm">
                      拖拽字段到这里
                    </div>
                  ) : (
                    group.fields.map((fieldConfig, fieldIndex) => {
                      const field = getFieldById(fieldConfig.fieldId)
                      if (!field) return null
                      return (
                        <div
                          key={fieldConfig.fieldId}
                          draggable
                          onDragStart={e =>
                            handleDragStart(e, field, { groupId: group.id, index: fieldIndex })
                          }
                          onDragEnd={handleDragEnd}
                          className={cn(
                            "cursor-grab active:cursor-grabbing",
                            fieldConfig.span === 2 && "col-span-2"
                          )}
                        >
                          <FieldCard
                            field={field}
                            span={fieldConfig.span}
                            onToggleSpan={() => toggleFieldSpan(group.id, fieldIndex)}
                            onRemove={() => removeFieldFromGroup(group.id, fieldIndex)}
                            onMoveUp={() => moveFieldInGroup(group.id, fieldIndex, 'up')}
                            onMoveDown={() => moveFieldInGroup(group.id, fieldIndex, 'down')}
                            showMoveButtons={true}
                          />
                        </div>
                      )
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
