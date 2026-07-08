"use client"

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, X, Image as ImageIcon, File, Loader2, Plus, Trash2, Layers } from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { cn } from '@/lib/utils'
import { FormLayoutConfig, SubGroupLayoutItem, FieldLayoutItem } from './form-layout-designer'
import { FolderOpen } from 'lucide-react'

interface ImageInfo {
  url: string
  name?: string
  size?: number
  type?: string
  uploading?: boolean
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

const getFileExtension = (url: string): string => {
  const ext = url.split('.').pop()?.split('?')[0] || ''
  return ext.toUpperCase()
}

/** 将项目按行分组，每行总宽度不超过 columns */
const groupItemsIntoRows = (items: any[], columns: number = 2): any[][] => {
  const maxColumns = Math.max(1, columns || 2)
  const rows: any[][] = []
  let currentRow: any[] = []
  let currentWidth = 0

  for (const item of items) {
    const width = item.width || 1
    if (width >= maxColumns) {
      if (currentRow.length > 0) {
        rows.push(currentRow)
        currentRow = []
        currentWidth = 0
      }
      rows.push([item])
    } else {
      if (currentWidth + width > maxColumns) {
        rows.push(currentRow)
        currentRow = [item]
        currentWidth = width
      } else {
        currentRow.push(item)
        currentWidth += width
      }
    }
  }

  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  return rows
}

interface ImageUploadFieldProps {
  urls: string[]
  onChange: (urls: string[]) => void
  disabled?: boolean
  fieldName: string
}

function ImageUploadField({ urls, onChange, disabled, fieldName }: ImageUploadFieldProps) {
  const [imgErrors, setImgErrors] = useState<Record<number, boolean>>({})
  const [imgSizes, setImgSizes] = useState<Record<number, { width: number; height: number }>>({})

  const handleImgLoad = (idx: number, e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement
    setImgSizes(prev => ({
      ...prev,
      [idx]: { width: img.naturalWidth, height: img.naturalHeight }
    }))
  }

  const handleImgError = (idx: number) => {
    setImgErrors(prev => ({ ...prev, [idx]: true }))
  }

  const handleFileUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('fieldName', fieldName)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        onChange([...urls, data.url])
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('上传失败')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {urls.map((url, idx) => (
          <div key={idx} className="flex flex-col gap-1.5">
            <div className="relative w-24 h-24 border rounded-lg overflow-hidden bg-gray-50">
              {imgErrors[idx] ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <ImageIcon className="w-8 h-8 mb-1" />
                  <span className="text-xs">加载失败</span>
                </div>
              ) : (
                <img 
                  src={url} 
                  alt="" 
                  className="w-full h-full object-cover"
                  onLoad={(e) => handleImgLoad(idx, e)}
                  onError={() => handleImgError(idx)}
                />
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => {
                    const newUrls = urls.filter((_, i) => i !== idx)
                    onChange(newUrls)
                  }}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="text-xs text-gray-500 space-y-0.5 w-24">
              <div className="truncate" title={url.split('/').pop()}>
                {url.split('/').pop()}
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block px-1 bg-gray-100 rounded text-[10px]">
                  {getFileExtension(url)}
                </span>
                {imgSizes[idx] && (
                  <span className="text-[10px] text-gray-400">
                    {imgSizes[idx].width}×{imgSizes[idx].height}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {!disabled && (
          <label className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors">
            <ImageIcon className="w-6 h-6 text-gray-400" />
            <span className="text-xs text-gray-500 mt-1">上传图片</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = e.target.files
                if (files) {
                  Array.from(files).forEach(f => handleFileUpload(f))
                }
              }}
            />
          </label>
        )}
      </div>
    </div>
  )
}

interface DynamicFormProps {
  fields: TableField[]
  values: Record<string, any>
  onChange: (values: Record<string, any>) => void
  disabled?: boolean
  layoutConfig?: FormLayoutConfig | null
}

export function DynamicForm({ fields, values, onChange, disabled, layoutConfig }: DynamicFormProps) {
  const formFields = fields.filter(f => f.showInForm)

  const handleChange = (name: string, value: any) => {
    onChange({ ...values, [name]: value })
  }

  const hasValidLayout = layoutConfig && layoutConfig.groups && layoutConfig.groups.length > 0

  const getFieldById = (fieldId: number) => fields.find(f => f.id === fieldId)
  const getFieldByName = (fieldName: string) => fields.find(f => f.name === fieldName)

  const handleFileUpload = async (fieldName: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('fieldName', fieldName)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (res.ok) {
        const data = await res.json()
        const current = values[fieldName]
        const currentArr: string[] = Array.isArray(current) ? current : (current ? [current] : [])
        handleChange(fieldName, [...currentArr, data.url])
      }
    } catch (err) {
      console.error('Upload error:', err)
      alert('上传失败')
    }
  }

  // 明细表单字段渲染
  const renderDetailTableField = (field: TableField) => {
    const value = values[field.name] || []
    const detailRows: Array<Record<string, any>> = Array.isArray(value) ? value : []
    const config = (field.config as any) || {}
    const minRows: number = config.minRows ?? 0
    const maxRows: number = config.maxRows ?? 100
    const detailTableName: string = config.detailTableName || ''
    const detailTableId: number | undefined = config.detailTableId

    const [detailFields, setDetailFields] = useState<TableField[]>([])
    const [loadingFields, setLoadingFields] = useState(false)

    useEffect(() => {
      if (detailTableId) {
        setLoadingFields(true)
        fetch(`/api/tables/${detailTableId}/fields`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (data?.fields) {
              setDetailFields(data.fields.filter((f: TableField) => f.showInForm))
            }
          })
          .catch(() => {})
          .finally(() => setLoadingFields(false))
      }
    }, [detailTableId])

    const addDetailRow = () => {
      if (detailRows.length >= maxRows) {
        alert(`最多只能添加 ${maxRows} 条明细记录`)
        return
      }
      handleChange(field.name, [...detailRows, {}])
    }

    const removeDetailRow = (idx: number) => {
      if (detailRows.length <= minRows) {
        if (minRows > 0) {
          alert(`至少需要保留 ${minRows} 条明细记录`)
          return
        }
      }
      handleChange(field.name, detailRows.filter((_, i) => i !== idx))
    }

    const updateDetailRow = (idx: number, key: string, val: any) => {
      const newRows = [...detailRows]
      newRows[idx] = { ...newRows[idx], [key]: val }
      handleChange(field.name, newRows)
    }

    if (!detailTableId) {
      return (
        <div className="p-3 border border-dashed border-amber-300 bg-amber-50 rounded-md text-sm text-amber-700">
          请先在字段设计中为此字段配置关联子表
        </div>
      )
    }

    return (
      <div className="space-y-3 border rounded-md p-3 bg-gray-50/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Layers className="w-4 h-4" />
            <span>明细记录（{detailRows.length} 条）</span>
            {detailTableName && <Badge variant="secondary" className="text-xs">{detailTableName}</Badge>}
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addDetailRow}
              disabled={detailRows.length >= maxRows}
            >
              <Plus className="w-3 h-3 mr-1" />
              添加明细
            </Button>
          )}
        </div>

        {loadingFields ? (
          <div className="text-center py-4 text-sm text-gray-500">加载子表字段中...</div>
        ) : detailFields.length === 0 ? (
          <div className="text-center py-4 text-sm text-gray-400 border border-dashed rounded">
            关联子表没有可录入的字段
          </div>
        ) : (
          <div className="space-y-2">
            {detailRows.map((row, idx) => (
              <div key={idx} className="border rounded-md p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">第 {idx + 1} 条</span>
                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-red-500"
                      onClick={() => removeDetailRow(idx)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {detailFields.map(df => (
                    <div key={df.id} className="space-y-1">
                      <Label className="text-xs text-gray-600">
                        {df.label}{df.required && <span className="text-red-500 ml-1">*</span>}
                      </Label>
                      <Input
                        type="text"
                        placeholder={df.placeholder || `请输入${df.label}`}
                        value={row[df.name] || ''}
                        onChange={(e) => updateDetailRow(idx, df.name, e.target.value)}
                        disabled={disabled}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {detailRows.length === 0 && (
              <div className="text-center py-4 text-sm text-gray-400 border border-dashed rounded">
                {minRows > 0 ? `至少需要添加 ${minRows} 条明细` : '点击"添加明细"按钮录入子记录'}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderField = (field: TableField) => {
    const value = values[field.name] || ''
    const isRequired = field.required

    switch (field.type) {
      case FieldType.TEXT:
      case FieldType.PHONE:
      case FieldType.EMAIL:
      case FieldType.IDCARD:
        return (
          <Input
            type={field.type === FieldType.EMAIL ? 'email' : field.type === FieldType.PHONE ? 'tel' : 'text'}
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={disabled}
          />
        )

      case FieldType.TEXTAREA:
      case FieldType.ADDRESS:
        return (
          <Textarea
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={disabled}
            rows={4}
          />
        )

      case FieldType.NUMBER:
      case FieldType.INTEGER:
      case FieldType.FLOAT:
      case FieldType.MONEY:
        return (
          <Input
            type="number"
            step={field.type === FieldType.INTEGER ? '1' : '0.01'}
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={disabled}
          />
        )

      case FieldType.DATE:
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={disabled}
          />
        )

      case FieldType.DATETIME:
        return (
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={disabled}
          />
        )

      case FieldType.SELECT:
      case FieldType.RADIO:
        const options = field.options as any[] || []
        return (
          <Select
            value={value}
            onValueChange={(v) => handleChange(field.name, v)}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={`请选择${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case FieldType.MULTISELECT:
      case FieldType.CHECKBOX:
        const multiOptions = field.options as any[] || []
        const selectedValues: string[] = Array.isArray(value) ? value : []
        return (
          <div className="space-y-2">
            {multiOptions.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleChange(field.name, [...selectedValues, opt.value])
                    } else {
                      handleChange(field.name, selectedValues.filter(v => v !== opt.value))
                    }
                  }}
                  disabled={disabled}
                  className="w-4 h-4"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        )

      case FieldType.SWITCH:
        return (
          <Switch
            checked={value === true || value === 'true' || value === 1}
            onCheckedChange={(v) => handleChange(field.name, v)}
            disabled={disabled}
          />
        )

      case FieldType.UPLOAD_IMAGE:
        const imageUrls: string[] = Array.isArray(value) ? value : (value ? [value] : [])
        return (
          <ImageUploadField
            urls={imageUrls}
            onChange={(urls) => handleChange(field.name, urls)}
            disabled={disabled}
            fieldName={field.name}
          />
        )

      case FieldType.UPLOAD_FILE:
        const fileUrls: string[] = Array.isArray(value) ? value : (value ? [value] : [])
        return (
          <div className="space-y-3">
            <div className="space-y-2">
              {fileUrls.map((url, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <File className="w-4 h-4 text-gray-500" />
                  <span className="text-sm flex-1 truncate">{url.split('/').pop()}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => {
                        const newUrls = fileUrls.filter((_, i) => i !== idx)
                        handleChange(field.name, newUrls)
                      }}
                      className="text-red-500 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!disabled && (
              <label className="inline-flex items-center gap-2 px-4 py-2 border rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                <Upload className="w-4 h-4" />
                <span className="text-sm">上传文件</span>
                <input
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files
                    if (files) {
                      Array.from(files).forEach(f => handleFileUpload(field.name, f))
                    }
                  }}
                />
              </label>
            )}
          </div>
        )

      case FieldType.DETAIL_TABLE:
        return renderDetailTableField(field)

      default:
        return (
          <Input
            type="text"
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            disabled={disabled}
          />
        )
    }
  }

  const renderFieldWithLabel = (field: TableField, width?: number, labelWidth?: number) => {
    const fieldWidth = width || 1
    const useHorizontalLayout = fieldWidth >= 2 &&
      field.type !== 'TEXTAREA' && 
      field.type !== 'UPLOAD_IMAGE' && 
      field.type !== 'UPLOAD_FILE' && 
      field.type !== 'DETAIL_TABLE' &&
      field.type !== 'MULTISELECT' &&
      field.type !== 'CHECKBOX'
    
    if (useHorizontalLayout) {
      const labelW = labelWidth || 100
      return (
        <div key={field.id} className="w-full min-w-0 flex gap-2 items-start">
          <Label
            className="text-xs text-gray-600 font-medium flex-shrink-0"
            style={{ 
              width: `${labelW}px`, 
              minWidth: `${labelW}px`,
              textAlign: 'right',
              paddingRight: '4px',
              lineHeight: '32px',
            }}
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-0.5">*</span>}
          </Label>
          <div className="flex-1 min-w-0">
            {renderField(field)}
            {field.description && (
              <p className="text-xs text-gray-500 mt-1">{field.description}</p>
            )}
          </div>
        </div>
      )
    }
    
    return (
      <div key={field.id} className="w-full min-w-0 space-y-1.5">
        <Label
          className="block text-xs text-gray-600 font-medium"
          style={{ textAlign: 'left' }}
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        <div className="w-full">
          {renderField(field)}
          {field.description && (
            <p className="text-xs text-gray-500 mt-1">{field.description}</p>
          )}
        </div>
      </div>
    )
  }

  /** 渲染子分组 */
  const renderSubGroup = (subGroup: SubGroupLayoutItem, parentColumns: number = 2) => {
    const columns = subGroup.columns || 2

    return (
      <div
        key={subGroup.id}
        className="border rounded-lg bg-gray-50/50"
        style={{
          flex: subGroup.width || 1,
          minWidth: 0,
          alignSelf: 'flex-start',
          height: 'fit-content',
        }}
      >
        {subGroup.title && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-100/40 rounded-t-lg">
            <FolderOpen className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-medium">{subGroup.title}</span>
          </div>
        )}
        <div className="p-4 space-y-3">
          {groupItemsIntoRows(subGroup.items || [], columns).map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-3 items-start">
              {row.map(item => {
                const itemWidth = item.width || 1
                return (
                  <div
                  key={item.id}
                  style={{
                    flex: itemWidth,
                    minWidth: 0,
                  }}
                >
                    {item.type === 'field'
                      ? (() => {
                          const field = getFieldById(item.fieldId) || getFieldByName(item.fieldName)
                          if (!field || !field.showInForm) return null
                          return renderFieldWithLabel(field, item.width, (item as FieldLayoutItem).labelWidth)
                        })()
                      : renderSubGroup(item as SubGroupLayoutItem, columns)
                    }
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    )
  }

  /** 检测是否是新版配置 */
  const isNewFormat = (config: any): boolean => {
    if (!config || !config.groups) return false
    return config.groups.some((g: any) => Array.isArray(g.items))
  }

  /** 旧版兼容渲染 */
  const renderLegacyGroup = (group: any) => {
    const columns = group.columns || 2
    return (
      <Card key={group.id}>
        {group.title && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group.title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-3">
          {groupItemsIntoRows((group.fields || []).map((f: any) => ({ ...f, type: 'field', width: f.span === 2 ? 2 : 1, id: f.fieldId || f.fieldName })), columns).map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-6 items-start">
              {row.map(fieldConfig => {
                const fieldWidth = fieldConfig.width || 1
                const field = getFieldById(fieldConfig.fieldId) || getFieldByName(fieldConfig.fieldName)
                if (!field || !field.showInForm) return null
                return (
                  <div
                    key={fieldConfig.id}
                    style={{
                      flex: fieldWidth,
                      minWidth: 0,
                    }}
                  >
                    {renderFieldWithLabel(field, fieldConfig.width, fieldConfig.labelWidth)}
                  </div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  /** 新版渲染 */
  const renderNewGroup = (group: any) => {
    const columns = group.columns || 2
    return (
      <Card key={group.id}>
        {group.title && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{group.title}</CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-3">
          {groupItemsIntoRows(group.items || [], columns).map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-3 items-start">
              {row.map(item => {
                const itemWidth = item.width || 1
                return (
                  <div
                    key={item.id}
                    style={{
                      flex: itemWidth,
                      minWidth: 0,
                    }}
                  >
                    {item.type === 'field'
                      ? (() => {
                          const field = getFieldById(item.fieldId) || getFieldByName(item.fieldName)
                          if (!field || !field.showInForm) return null
                          return renderFieldWithLabel(field, item.width, (item as FieldLayoutItem).labelWidth)
                        })()
                      : renderSubGroup(item as SubGroupLayoutItem, columns)
                    }
                  </div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  if (hasValidLayout) {
    return (
      <div className="space-y-6">
        {layoutConfig!.groups.map((group: any) =>
          isNewFormat(layoutConfig)
            ? renderNewGroup(group)
            : renderLegacyGroup(group)
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {formFields.map((field) => (
        <div key={field.id} className={cn(
          "space-y-2",
          field.type === FieldType.UPLOAD_IMAGE || field.type === FieldType.UPLOAD_FILE ? "col-span-full" : ""
        )}>
          <Label className="flex items-center gap-1">
            {field.label}
            {field.required && <span className="text-red-500">*</span>}
          </Label>
          {renderField(field)}
          {field.description && (
            <p className="text-xs text-gray-500">{field.description}</p>
          )}
        </div>
      ))}
    </div>
  )
}
