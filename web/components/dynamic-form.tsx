"use client"

import { useState } from 'react'
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
import { Upload, X, Image as ImageIcon, File, Loader2 } from 'lucide-react'
import { TableField, FieldType } from '@prisma/client'
import { cn } from '@/lib/utils'

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
}

export function DynamicForm({ fields, values, onChange, disabled }: DynamicFormProps) {
  const formFields = fields.filter(f => f.showInForm)

  const handleChange = (name: string, value: any) => {
    onChange({ ...values, [name]: value })
  }

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
