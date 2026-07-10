"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Save, Edit, X, Paperclip, Image as ImageIcon,
  FileText, Upload, Plus, Trash2, Eye, Download, Camera
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { FieldType, RecordStatus } from '@prisma/client'

const statusMap: Record<RecordStatus, { label: string; variant: string }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  SUBMITTED: { label: '已提交', variant: 'default' },
  REVIEWED: { label: '已审核', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  ARCHIVED: { label: '已归档', variant: 'outline' },
}

const statusColorMap: Record<string, string> = {
  secondary: 'bg-gray-100 text-gray-600',
  default: 'bg-blue-100 text-blue-600',
  success: 'bg-green-100 text-green-600',
  destructive: 'bg-red-100 text-red-600',
  outline: 'bg-yellow-100 text-yellow-600',
}

interface H5RecordDetailClientProps {
  table: any
  record: any
  canEdit: boolean
}

export function H5RecordDetailClient({ table, record, canEdit }: H5RecordDetailClientProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>(record.data as any || {})
  const [loading, setLoading] = useState(false)

  // 附件
  const [attachments, setAttachments] = useState<any[]>(record.attachments || [])
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadType, setUploadType] = useState<'image' | 'file'>('image')
  const [uploadNameError, setUploadNameError] = useState('')
  const [uploading, setUploading] = useState(false)

  const sInfo = statusMap[record.status as RecordStatus]
  const formFields = table.fields.filter((f: any) => f.showInForm)

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/data/${table.name}/${record.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: formData }),
      })
      if (res.ok) {
        setIsEditing(false)
        location.reload()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      if (file.type.startsWith('image/')) setUploadType('image')
      else setUploadType('file')
    }
  }

  const handleUploadAttachment = async () => {
    setUploadNameError('')
    if (!uploadName.trim()) {
      setUploadNameError('请填写附件名称')
      return
    }
    if (!uploadFile) {
      setUploadNameError('请选择文件')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('displayName', uploadName.trim())
      fd.append('type', uploadType)

      const res = await fetch(`/api/attachments/${table.name}/${record.id}`, {
        method: 'POST',
        body: fd,
      })

      if (res.ok) {
        const data = await res.json()
        setAttachments(prev => [data.attachment, ...prev])
        setShowUploadForm(false)
        setUploadName('')
        setUploadFile(null)
      } else {
        const data = await res.json()
        alert(data.message || '上传失败')
      }
    } catch {
      alert('上传失败')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteAttachment = async (id: number) => {
    if (!confirm('确定删除此附件？')) return
    try {
      const res = await fetch(`/api/attachments/item/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setAttachments(prev => prev.filter(a => a.id !== id))
      }
    } catch { alert('删除失败') }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const renderFieldValue = (field: any) => {
    const val = isEditing ? formData[field.name] : record.data?.[field.name]
    const isEmpty = val === undefined || val === null || val === ''

    if (isEditing) {
      switch (field.type) {
        case FieldType.TEXT:
        case FieldType.PHONE:
        case FieldType.EMAIL:
        case FieldType.IDCARD:
          return (
            <Input
              type={field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'}
              placeholder={field.placeholder || `请输入${field.label}`}
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              className="h-10 text-sm rounded-lg"
            />
          )
        case FieldType.TEXTAREA:
        case FieldType.ADDRESS:
          return (
            <Textarea
              placeholder={field.placeholder || `请输入${field.label}`}
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              rows={3}
              className="text-sm rounded-lg resize-none"
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
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              className="h-10 text-sm rounded-lg"
            />
          )
        case FieldType.DATE:
          return (
            <Input
              type="date"
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              className="h-10 text-sm rounded-lg"
            />
          )
        case FieldType.DATETIME:
          return (
            <Input
              type="datetime-local"
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              className="h-10 text-sm rounded-lg"
            />
          )
        case FieldType.SELECT:
        case FieldType.RADIO:
          const options = field.options as any[] || []
          return (
            <select
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white"
            >
              <option value="">请选择{field.label}</option>
              {options.map((opt: any) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )
        case FieldType.SWITCH:
          return (
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={val === true || val === 'true' || val === 1}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          )
        default:
          return (
            <Input
              type="text"
              value={val || ''}
              onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
              className="h-10 text-sm rounded-lg"
            />
          )
      }
    }

    // 只读模式
    if (isEmpty) return <span className="text-gray-300">-</span>

    if (field.type === FieldType.UPLOAD_IMAGE) {
      const images: string[] = Array.isArray(val) ? val : [val]
      return (
        <div className="flex flex-wrap gap-2">
          {images.map((url, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden bg-gray-100">
              <img src={url} className="w-full h-full object-cover" onClick={() => window.open(url, '_blank')} />
            </div>
          ))}
        </div>
      )
    }

    if (field.type === FieldType.UPLOAD_FILE) {
      const files: string[] = Array.isArray(val) ? val : [val]
      return (
        <div className="space-y-1">
          {files.map((url, idx) => (
            <a key={idx} href={url} target="_blank" className="flex items-center gap-2 text-sm text-primary">
              <FileText className="w-4 h-4" />
              {url.split('/').pop()}
            </a>
          ))}
        </div>
      )
    }

    if (field.type === FieldType.SWITCH) {
      return <span className="text-sm">{val ? '是' : '否'}</span>
    }

    return <span className="text-sm text-gray-900">{String(val)}</span>
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* 头部 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.back()}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-gray-900">#{record.id}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColorMap[sInfo?.variant] || 'bg-gray-100'}`}>
                  {sInfo?.label}
                </span>
              </div>
              <p className="text-xs text-gray-500">{table.label}</p>
            </div>
          </div>
          {canEdit && (
            isEditing ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => setIsEditing(false)}>
                  <X className="w-4 h-4" />
                </Button>
                <Button size="sm" className="h-8 rounded-lg" onClick={handleSave} disabled={loading}>
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <Button size="sm" className="h-8 rounded-lg" onClick={() => setIsEditing(true)}>
                <Edit className="w-4 h-4 mr-1" />
                编辑
              </Button>
            )
          )}
        </div>
      </div>

      {/* 内容 */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* 基本信息 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            {isEditing ? '编辑信息' : '基本信息'}
          </h3>
          <div className="space-y-3">
            {formFields.map((field: any) => (
              <div key={field.id} className="space-y-1">
                <Label className="text-xs text-gray-500">
                  {field.label}
                  {field.required && !isEditing && <span className="text-red-400 ml-1">*</span>}
                </Label>
                {renderFieldValue(field)}
              </div>
            ))}
          </div>
        </div>

        {/* 附件 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
              <Paperclip className="w-4 h-4" />
              附件材料 ({attachments.length})
            </h3>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={() => setShowUploadForm(!showUploadForm)}
              >
                <Plus className="w-3 h-3 mr-1" />
                添加附件
              </Button>
            )}
          </div>

          {/* 上传表单 */}
          {showUploadForm && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-3 border border-gray-200">
              <div>
                <Label className="text-sm">附件名称 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="如：身份证正面、合同扫描件、现场照片"
                  value={uploadName}
                  onChange={(e) => { setUploadName(e.target.value); setUploadNameError('') }}
                  className="h-10 text-sm rounded-lg mt-1"
                />
              </div>
              <div>
                <Label className="text-sm">附件类型</Label>
                <div className="flex gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setUploadType('image')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${
                      uploadType === 'image' ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <ImageIcon className="w-4 h-4" />图片
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadType('file')}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border ${
                      uploadType === 'file' ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    <FileText className="w-4 h-4" />文件
                  </button>
                </div>
              </div>
              <div>
                <Label className="text-sm">选择文件</Label>
                <input
                  type="file"
                  accept={uploadType === 'image' ? 'image/*' : '*'}
                  capture={uploadType === 'image' ? 'environment' : undefined}
                  onChange={handleFileSelect}
                  className="mt-1 block w-full text-sm text-gray-500
                    file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                    file:text-sm file:font-medium file:bg-primary file:text-white"
                />
                {uploadFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    已选：{uploadFile.name} ({formatFileSize(uploadFile.size)})
                  </p>
                )}
              </div>
              {uploadNameError && <p className="text-sm text-red-500">{uploadNameError}</p>}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-9 rounded-lg"
                  onClick={() => { setShowUploadForm(false); setUploadName(''); setUploadFile(null) }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="flex-1 h-9 rounded-lg"
                  onClick={handleUploadAttachment}
                  disabled={uploading || !uploadName.trim() || !uploadFile}
                >
                  {uploading ? '上传中...' : '确认上传'}
                </Button>
              </div>
            </div>
          )}

          {/* 附件列表 */}
          {attachments.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Paperclip className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p className="text-sm">暂无附件</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((att: any) => (
                <div key={att.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0 flex items-center justify-center">
                    {att.type === 'IMAGE' ? (
                      <img
                        src={`/api/attachments/item/${att.id}`}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <FileText className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{att.displayName}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {att.originalName} · {formatFileSize(att.fileSize)}
                    </p>
                    <p className="text-xs text-gray-300">
                      {att.uploader?.realName || att.uploader?.username}{att.uploader?.phone ? ` (${att.uploader.phone})` : ''} · {formatDateTime(att.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => window.open(`/api/attachments/item/${att.id}`, '_blank')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400"
                        onClick={() => handleDeleteAttachment(att.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 记录信息 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-medium text-gray-900 mb-3">记录信息</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400">创建人</p>
              <p className="mt-0.5">{record.creator?.realName || record.creator?.username || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">创建时间</p>
              <p className="mt-0.5">{formatDateTime(record.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">更新时间</p>
              <p className="mt-0.5">{formatDateTime(record.updatedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">所属项目</p>
              <p className="mt-0.5">{table.label}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}