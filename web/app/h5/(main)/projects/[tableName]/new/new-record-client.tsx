"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Save, Send, Plus, Trash2, Paperclip,
  Image as ImageIcon, FileText, Upload, X, Camera
} from 'lucide-react'
import { FieldType, RecordStatus } from '@prisma/client'

interface H5NewRecordClientProps {
  table: any
}

export function H5NewRecordClient({ table }: H5NewRecordClientProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)

  // 附件功能
  const [attachments, setAttachments] = useState<{
    id: string
    displayName: string
    file: File
    type: 'image' | 'file'
    preview?: string
  }[]>([])

  const [showAttachmentForm, setShowAttachmentForm] = useState(false)
  const [attachmentName, setAttachmentName] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [attachmentType, setAttachmentType] = useState<'image' | 'file'>('image')
  const [attachmentNameError, setAttachmentNameError] = useState('')

  const formFields = table.fields.filter((f: any) => f.showInForm)

  const handleChange = (name: string, value: any) => {
    setFormData({ ...formData, [name]: value })
  }

  const handleAddAttachment = () => {
    setAttachmentNameError('')

    if (!attachmentName.trim()) {
      setAttachmentNameError('请填写附件名称')
      return
    }
    if (!attachmentFile) {
      setAttachmentNameError('请选择文件')
      return
    }

    const preview = attachmentType === 'image' ? URL.createObjectURL(attachmentFile) : undefined

    setAttachments(prev => [...prev, {
      id: `temp_${Date.now()}`,
      displayName: attachmentName.trim(),
      file: attachmentFile,
      type: attachmentType,
      preview,
    }])

    // 重置表单
    setAttachmentName('')
    setAttachmentFile(null)
    setAttachmentType('image')
    setShowAttachmentForm(false)
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => {
      const item = prev.find(a => a.id === id)
      if (item?.preview) URL.revokeObjectURL(item.preview)
      return prev.filter(a => a.id !== id)
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAttachmentFile(file)
      // 自动识别类型
      if (file.type.startsWith('image/')) {
        setAttachmentType('image')
      } else {
        setAttachmentType('file')
      }
    }
  }

  const handleSubmit = async (status: RecordStatus = RecordStatus.DRAFT) => {
    // 验证必填字段
    const requiredFields = formFields.filter((f: any) => f.required)
    const missingFields = requiredFields.filter((f: any) => {
      const val = formData[f.name]
      return val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)
    }).map((f: any) => f.label)

    if (missingFields.length > 0) {
      alert(`以下必填项为空：\n${missingFields.join('\n')}`)
      return
    }

    // 验证附件是否都有名称
    const unnamedAttachments = attachments.filter(a => !a.displayName.trim())
    if (unnamedAttachments.length > 0) {
      alert('所有附件都必须填写名称')
      return
    }

    setLoading(true)
    try {
      // 1. 创建记录
      const res = await fetch(`/api/data/${table.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData, status }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.message || '保存失败')
        setLoading(false)
        return
      }

      const record = await res.json()
      const recordId = record.record?.id || record.id

      // 2. 上传附件
      if (attachments.length > 0 && recordId) {
        for (const attachment of attachments) {
          const fd = new FormData()
          fd.append('file', attachment.file)
          fd.append('displayName', attachment.displayName)
          fd.append('type', attachment.type)

          await fetch(`/api/attachments/${table.name}/${recordId}`, {
            method: 'POST',
            body: fd,
          })
        }
      }

      router.push(`/h5/projects/${table.name}`)
    } catch (err) {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const renderField = (field: any) => {
    const value = formData[field.name] || ''

    switch (field.type) {
      case FieldType.TEXT:
      case FieldType.PHONE:
      case FieldType.EMAIL:
      case FieldType.IDCARD:
        return (
          <Input
            type={field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'}
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="h-11 text-sm rounded-xl"
          />
        )

      case FieldType.TEXTAREA:
      case FieldType.ADDRESS:
        return (
          <Textarea
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            rows={3}
            className="text-sm rounded-xl resize-none"
          />
        )

      case FieldType.NUMBER:
      case FieldType.INTEGER:
      case FieldType.FLOAT:
      case FieldType.MONEY:
        return (
          <Input
            type="number"
            step={field.type === 'INTEGER' ? '1' : '0.01'}
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="h-11 text-sm rounded-xl"
          />
        )

      case FieldType.DATE:
        return (
          <Input
            type="date"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="h-11 text-sm rounded-xl"
          />
        )

      case FieldType.DATETIME:
        return (
          <Input
            type="datetime-local"
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="h-11 text-sm rounded-xl"
          />
        )

      case FieldType.SELECT:
      case FieldType.RADIO:
        const options = field.options as any[] || []
        return (
          <select
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="w-full h-11 px-3 text-sm border border-gray-200 rounded-xl bg-white"
          >
            <option value="">请选择{field.label}</option>
            {options.map((opt: any) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )

      case FieldType.MULTISELECT:
      case FieldType.CHECKBOX:
        const multiOptions = field.options as any[] || []
        const selectedValues: string[] = Array.isArray(value) ? value : []
        return (
          <div className="space-y-2">
            {multiOptions.map((opt: any) => (
              <label key={opt.value} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      handleChange(field.name, [...selectedValues, opt.value])
                    } else {
                      handleChange(field.name, selectedValues.filter((v: string) => v !== opt.value))
                    }
                  }}
                  className="w-4 h-4 rounded accent-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        )

      case FieldType.SWITCH:
        return (
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={value === true || value === 'true' || value === 1}
              onChange={(e) => handleChange(field.name, e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
          </label>
        )

      case FieldType.UPLOAD_IMAGE:
        const imageUrls: string[] = Array.isArray(value) ? value : (value ? [value] : [])
        return (
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((url, idx) => (
              <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
                <img src={url} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    handleChange(field.name, imageUrls.filter((_, i) => i !== idx))
                  }}
                  className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer">
              <Camera className="w-6 h-6 text-gray-400" />
              <span className="text-xs text-gray-400 mt-1">拍照</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const fd = new FormData()
                    fd.append('file', file)
                    fd.append('fieldName', field.name)
                    try {
                      const res = await fetch('/api/upload', { method: 'POST', body: fd })
                      if (res.ok) {
                        const data = await res.json()
                        const current = formData[field.name]
                        const arr: string[] = Array.isArray(current) ? current : (current ? [current] : [])
                        handleChange(field.name, [...arr, data.url])
                      }
                    } catch { alert('上传失败') }
                  }
                }}
              />
            </label>
          </div>
        )

      case FieldType.UPLOAD_FILE:
        const fileUrls: string[] = Array.isArray(value) ? value : (value ? [value] : [])
        return (
          <div className="space-y-2">
            {fileUrls.map((url, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                <FileText className="w-4 h-4 text-gray-500" />
                <span className="text-sm flex-1 truncate">{url.split('/').pop()}</span>
                <button type="button" onClick={() => {
                  handleChange(field.name, fileUrls.filter((_, i) => i !== idx))
                }} className="text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <label className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer">
              <Upload className="w-4 h-4" />
              <span className="text-sm">上传文件</span>
              <input
                type="file"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    const fd = new FormData()
                    fd.append('file', file)
                    fd.append('fieldName', field.name)
                    try {
                      const res = await fetch('/api/upload', { method: 'POST', body: fd })
                      if (res.ok) {
                        const data = await res.json()
                        const current = formData[field.name]
                        const arr: string[] = Array.isArray(current) ? current : (current ? [current] : [])
                        handleChange(field.name, [...arr, data.url])
                      }
                    } catch { alert('上传失败') }
                  }
                }}
              />
            </label>
          </div>
        )

      default:
        return (
          <Input
            type="text"
            placeholder={field.placeholder || `请输入${field.label}`}
            value={value}
            onChange={(e) => handleChange(field.name, e.target.value)}
            className="h-11 text-sm rounded-xl"
          />
        )
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* 头部 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">新增{table.label}</h1>
            <p className="text-xs text-gray-500">填写以下信息</p>
          </div>
        </div>
      </div>

      {/* 表单 */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {formFields.map((field: any) => (
          <div key={field.id} className="space-y-1.5">
            <Label className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </Label>
            {renderField(field)}
            {field.description && (
              <p className="text-xs text-gray-400">{field.description}</p>
            )}
          </div>
        ))}

        {/* 附件区域 */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Paperclip className="w-4 h-4" />
              附件材料
            </Label>
            <Button
              variant="outline"
              size="sm"
              className="h-8 rounded-lg text-xs"
              onClick={() => setShowAttachmentForm(!showAttachmentForm)}
            >
              <Plus className="w-3 h-3 mr-1" />
              添加附件
            </Button>
          </div>

          {/* 已添加的附件列表 */}
          {attachments.length > 0 && (
            <div className="space-y-2 mb-3">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0 flex items-center justify-center">
                    {att.type === 'image' && att.preview ? (
                      <img src={att.preview} className="w-full h-full object-cover" />
                    ) : (
                      <FileText className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{att.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{att.file.name}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {att.type === 'image' ? '图片' : '文件'}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="text-red-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 添加附件表单 */}
          {showAttachmentForm && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-200">
              <div>
                <Label className="text-sm">附件名称 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="如：身份证正面、合同扫描件、现场照片"
                  value={attachmentName}
                  onChange={(e) => { setAttachmentName(e.target.value); setAttachmentNameError('') }}
                  className="h-10 text-sm rounded-lg mt-1"
                />
              </div>

              <div>
                <Label className="text-sm">附件类型</Label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setAttachmentType('image')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                      attachmentType === 'image'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    图片
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttachmentType('file')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
                      attachmentType === 'file'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    文件
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-sm">选择文件</Label>
                <input
                  type="file"
                  accept={attachmentType === 'image' ? 'image/*' : '*'}
                  capture={attachmentType === 'image' ? 'environment' : undefined}
                  onChange={handleFileSelect}
                  className="mt-1 block w-full text-sm text-gray-500
                    file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                    file:text-sm file:font-medium file:bg-primary file:text-white
                    hover:file:bg-primary/90 cursor-pointer"
                />
                {attachmentFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    已选：{attachmentFile.name} ({attachmentFile.size > 1024 * 1024 ? (attachmentFile.size / 1024 / 1024).toFixed(1) + 'MB' : (attachmentFile.size / 1024).toFixed(0) + 'KB'})
                  </p>
                )}
              </div>

              {attachmentNameError && (
                <p className="text-sm text-red-500">{attachmentNameError}</p>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 rounded-lg"
                  onClick={() => {
                    setShowAttachmentForm(false)
                    setAttachmentName('')
                    setAttachmentFile(null)
                    setAttachmentNameError('')
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 rounded-lg"
                  onClick={handleAddAttachment}
                  disabled={!attachmentName.trim() || !attachmentFile}
                >
                  确认添加
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 底部操作按钮 */}
      <div className="sticky bottom-0 bg-white border-t px-4 py-3 flex gap-3">
        <Button
          variant="outline"
          onClick={() => handleSubmit(RecordStatus.DRAFT)}
          disabled={loading}
          className="flex-1 h-11 rounded-xl"
        >
          <Save className="w-4 h-4 mr-2" />
          保存草稿
        </Button>
        <Button
          onClick={() => handleSubmit(RecordStatus.SUBMITTED)}
          disabled={loading}
          className="flex-1 h-11 rounded-xl"
        >
          <Send className="w-4 h-4 mr-2" />
          提交
        </Button>
      </div>
    </div>
  )
}