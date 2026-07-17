"use client"

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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
import { FormLayoutConfig, SubGroupLayoutItem, FieldLayoutItem, FormCellData, FormLayoutGroup } from './form-layout-designer'
import { FormExcelConfig, SubTableConfig } from '@/types/form-excel-config'
import { CellData, FIELD_PATTERN } from '@/types/cell-data'
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

  const isFormExcelConfig = (config: any): config is FormExcelConfig => {
    return config && 'grid' in config && Array.isArray(config.grid)
  }

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
                        writingMode: cell.textOrientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
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
                              return <span key={i}>{renderField(field, cell.layoutDirection)}</span>
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

  const renderField = (field: TableField, layoutDirection?: 'vertical' | 'horizontal') => {
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
        const isHorizontal = layoutDirection === 'horizontal'
        return (
          <div className={isHorizontal ? 'flex flex-row flex-wrap gap-x-4 gap-y-1' : 'space-y-2'}>
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

  /** 判断字段是否使用垂直布局 */
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
        if (colIdx >= col && colIdx < col + span && r + rSpan > rowIdx) return true
        col += span
      }
    }
    return false
  }

  /** ========== Excel 多列网格渲染（新版 rows 格式） ========== */
  const renderExcelGridGroup = (group: FormLayoutGroup) => {
    const colWidths = group.colWidths || []
    const rows = group.rows || []

    return (
      <div key={group.id} className="excel-form-group">
        {group.title && (
          <div className="excel-group-header">{group.title}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            {colWidths.length > 0 && (
              <colgroup>
                {colWidths.map((w, i) => <col key={i} style={{ width: `${w}px` }} />)}
              </colgroup>
            )}
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    // 被合并覆盖的单元格跳过
                    if (isColCovered(row, ci) || isRowSpanCovered(rows, ri, ci)) return null

                    const field = cell.fieldId != null
                      ? getFieldById(cell.fieldId) || getFieldByName(cell.fieldName)
                      : null
                    if (!field || !field.showInForm) {
                      // 空单元格或无效字段
                      return (
                        <td key={ci} colSpan={cell.colSpan || 1}
                            rowSpan={(cell.rowSpan && cell.rowSpan > 1) ? cell.rowSpan : undefined}
                            className="border border-[#D9D9D9] min-h-[36px]" />
                      )
                    }

                    const vertical = isVerticalField(field.type)
                    const fontSize = cell.fontSize || group.defaultFontSize || 13
                    const labelW = cell.labelWidth || group.defaultLabelWidth || 90

                    return (
                      <td key={ci} colSpan={cell.colSpan || 1}
                          rowSpan={(cell.rowSpan && cell.rowSpan > 1) ? cell.rowSpan : undefined}
                          className="border border-[#D9D9D9] min-h-[36px] excel-cell">
                        {vertical ? (
                          <div className="excel-cell-vertical" style={{ fontSize: `${fontSize}px` }}>
                            <div className="excel-cell-label">
                              {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                            </div>
                            <div className="excel-cell-value-vertical">
                              {renderField(field, cell.layoutDirection)}
                              {field.description && (
                                <p className="text-xs text-gray-400 mt-1">{field.description}</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="excel-cell-horizontal">
                            <div className="excel-cell-label"
                                 style={{ width: `${labelW}px`, minWidth: `${labelW}px`, fontSize: `${fontSize}px` }}>
                              {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                            </div>
                            <div className="excel-cell-value" style={{ fontSize: `${fontSize}px` }}>
                              {renderField(field, cell.layoutDirection)}
                            </div>
                          </div>
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
    )
  }

  /** ========== 旧版 items 格式渲染（兼容） ========== */
  const renderFieldCell = (field: TableField, width?: number, labelWidth?: number, layoutDirection?: 'vertical' | 'horizontal') => {
    const isVertical = isVerticalField(field.type)
    const labelW = labelWidth || 90

    if (isVertical) {
      return (
        <div key={field.id} className="excel-cell-vertical">
          <div className="excel-cell-label">{field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}</div>
          <div className="excel-cell-value-vertical">
            {renderField(field, layoutDirection)}
            {field.description && (
              <p className="text-xs text-gray-400 mt-1">{field.description}</p>
            )}
          </div>
        </div>
      )
    }

    return (
      <div key={field.id} className="excel-cell-horizontal">
        <div className="excel-cell-label" style={{ width: `${labelW}px`, minWidth: `${labelW}px` }}>
          {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
        </div>
        <div className="excel-cell-value">
          {renderField(field, layoutDirection)}
        </div>
      </div>
    )
  }

  const renderSubGroup = (subGroup: SubGroupLayoutItem, _parentColumns: number = 1) => {
    const items = subGroup.items || []
    return (
      <div key={subGroup.id} className="excel-subgroup">
        {subGroup.title && (
          <div className="excel-subgroup-header">
            <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
            <span>{subGroup.title}</span>
          </div>
        )}
        <div className="excel-grid-inner" style={{ gridTemplateColumns: '1fr' }}>
          {items.map((item: any, idx: number) => {
            const isLast = idx === items.length - 1
            if (item.type === 'field') {
              const field = getFieldById(item.fieldId) || getFieldByName(item.fieldName)
              if (!field || !field.showInForm) return null
              return (
                <div key={item.id} className={cn("excel-cell-inner", isLast && "border-b-0")}>
                  {renderFieldCell(field, 1, item.labelWidth || subGroup.defaultLabelWidth, item.layoutDirection)}
                </div>
              )
            }
            return renderSubGroup(item as SubGroupLayoutItem, 1)
          })}
        </div>
      </div>
    )
  }

  const renderLegacyGroup = (group: any) => {
    const fieldConfigs = (group.fields || []).map((f: any) => ({ ...f, type: 'field', width: 1, id: f.fieldId || f.fieldName }))
    return (
      <div key={group.id} className="excel-form-group">
        {group.title && <div className="excel-group-header">{group.title}</div>}
        <div className="excel-grid" style={{ gridTemplateColumns: '1fr' }}>
          {fieldConfigs.map((fieldConfig: any, idx: number) => {
            const isLast = idx === fieldConfigs.length - 1
            const field = getFieldById(fieldConfig.fieldId) || getFieldByName(fieldConfig.fieldName)
            if (!field || !field.showInForm) return null
            return (
              <div key={fieldConfig.id} className={cn("excel-cell", isLast && "!border-b-0")}>
                {renderFieldCell(field, 1, fieldConfig.labelWidth)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderItemsGroup = (group: any) => {
    const items = group.items || []
    return (
      <div key={group.id} className="excel-form-group">
        {group.title && <div className="excel-group-header">{group.title}</div>}
        <div className="excel-grid" style={{ gridTemplateColumns: '1fr' }}>
          {items.map((item: any, idx: number) => {
            const isLast = idx === items.length - 1
            if (item.type === 'field') {
              const field = getFieldById(item.fieldId) || getFieldByName(item.fieldName)
              if (!field || !field.showInForm) return null
              return (
                <div key={item.id} className={cn("excel-cell", isLast && "!border-b-0")}>
                  {renderFieldCell(field, 1, item.labelWidth || group.defaultLabelWidth)}
                </div>
              )
            }
            return (
              <div key={item.id} className={cn("excel-subgroup-cell", isLast && "!border-b-0")}>
                {renderSubGroup(item as SubGroupLayoutItem, 1)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  /** ========== 主渲染入口 ========== */
  if (isFormExcelConfig(layoutConfig)) {
    return renderFormExcelGrid(layoutConfig as FormExcelConfig)
  }
  if (hasValidLayout) {
    return (
      <div className="excel-form-wrapper">
        {layoutConfig!.groups.map((group: any) => {
          // 新版网格格式（有 rows 数组）
          if (Array.isArray(group.rows) && group.rows.length > 0) {
            return renderExcelGridGroup(group as FormLayoutGroup)
          }
          // 旧版 items 格式
          if (Array.isArray(group.items)) {
            return renderItemsGroup(group)
          }
          // 最旧版 fields 格式
          return renderLegacyGroup(group)
        })}
      </div>
    )
  }

  // 无布局 fallback：单列行列表
  return (
    <div className="excel-form-wrapper">
      <div className="excel-form-group">
        <div className="excel-grid" style={{ gridTemplateColumns: '1fr' }}>
          {formFields.map((field, idx) => {
            const isLast = idx === formFields.length - 1
            return (
              <div key={field.id} className={cn("excel-cell", isLast && "!border-b-0")}>
                {renderFieldCell(field)}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
