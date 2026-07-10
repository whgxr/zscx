"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowLeft, Plus, Search, Eye, ChevronRight,
  Paperclip, Image as ImageIcon, FileText, Upload,
  X, Loader2, QrCode, Copy, Check
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

interface H5DataListClientProps {
  table: any
  user: any
  isAdmin: boolean
  permission: any | null
}

export function H5DataListClient({ table, user, isAdmin, permission }: H5DataListClientProps) {
  const router = useRouter()
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [attachmentCounts, setAttachmentCounts] = useState<Record<number, number>>({})
  const pageSize = 15

  const canCreate = isAdmin || permission?.canCreate
  const canEdit = isAdmin || permission?.canEdit
  const listFields = table.fields.filter((f: any) => f.showInList)

  // 快速上传附件弹窗
  const [uploadModal, setUploadModal] = useState<{ open: boolean; recordId: number | null }>({ open: false, recordId: null })
  const [uploadName, setUploadName] = useState('')
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadType, setUploadType] = useState<'image' | 'file'>('image')
  const [uploadNameError, setUploadNameError] = useState('')
  const [uploading, setUploading] = useState(false)

  const openUploadModal = (recordId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setUploadModal({ open: true, recordId })
    setUploadName('')
    setUploadFile(null)
    setUploadType('image')
    setUploadNameError('')
  }

  const handleQuickUpload = async () => {
    setUploadNameError('')
    if (!uploadName.trim()) { setUploadNameError('请填写附件名称'); return }
    if (!uploadFile) { setUploadNameError('请选择文件'); return }
    if (!uploadModal.recordId) return

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', uploadFile)
      fd.append('displayName', uploadName.trim())
      fd.append('type', uploadType)

      const res = await fetch(`/api/attachments/${table.name}/${uploadModal.recordId}`, {
        method: 'POST',
        body: fd,
      })

      if (res.ok) {
        setUploadModal({ open: false, recordId: null })
        setAttachmentCounts(prev => ({
          ...prev,
          [uploadModal.recordId!]: (prev[uploadModal.recordId!] || 0) + 1,
        }))
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

  // 二维码弹窗
  const [qrModal, setQrModal] = useState<{ open: boolean; recordId: number | null }>({ open: false, recordId: null })
  const [qrCopied, setQrCopied] = useState(false)

  const openQrModal = (recordId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setQrModal({ open: true, recordId })
    setQrCopied(false)
  }

  const viewUrl = (id: number) => `${window.location.origin}/view/${table.name}/${id}`

  const handleCopyQrUrl = async (id: number) => {
    try {
      await navigator.clipboard.writeText(viewUrl(id))
      setQrCopied(true)
      setTimeout(() => setQrCopied(false), 2000)
    } catch {}
  }

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() })
      if (search) params.set('search', search)
      if (status) params.set('status', status)

      const res = await fetch(`/api/data/${table.name}?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRecords(data.records || [])
        setTotal(data.total || 0)
        if (data.records?.length > 0) {
          fetchAttachmentCounts(data.records.map((r: any) => r.id))
        }
      }
    } catch (err) {
      console.error('Fetch records error:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAttachmentCounts = async (recordIds: number[]) => {
    try {
      const res = await fetch(`/api/attachments/${table.name}/count?ids=${recordIds.join(',')}`)
      if (res.ok) {
        const data = await res.json()
        setAttachmentCounts(prev => ({ ...prev, ...data.counts }))
      }
    } catch (err) {}
  }

  useEffect(() => { fetchRecords() }, [page, status])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchRecords()
  }

  const renderCellValue = (record: any, field: any) => {
    const val = record.data?.[field.name]
    if (val === undefined || val === null || val === '') return <span className="text-gray-300">-</span>

    if (field.type === FieldType.UPLOAD_IMAGE) {
      const images: string[] = Array.isArray(val) ? val : [val]
      return (
        <div className="flex items-center gap-1">
          <div className="w-8 h-8 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
            <img src={images[0]} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          </div>
          {images.length > 1 && <span className="text-xs text-gray-400">+{images.length - 1}</span>}
        </div>
      )
    }

    if (field.type === FieldType.UPLOAD_FILE) {
      const files: string[] = Array.isArray(val) ? val : [val]
      return <span className="text-xs text-gray-500">{files.length} 个文件</span>
    }

    return <span className="text-sm text-gray-700 truncate">{String(val).slice(0, 30)}</span>
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex flex-col min-h-screen">
      {/* 头部 */}
      <div className="bg-white px-4 pt-3 pb-3 border-b sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/projects')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">{table.label}</h1>
            <p className="text-xs text-gray-500">{total} 条记录</p>
          </div>
        </div>

        {/* 搜索和状态 */}
        <div className="flex gap-2">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-sm rounded-lg"
            />
          </form>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="h-9 px-3 text-sm border rounded-lg bg-white text-gray-600"
          >
            <option value="">全部</option>
            {Object.entries(statusMap).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 px-4 py-3">
        {loading ? (
          <div className="text-center py-16 text-gray-400">加载中...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 mx-auto text-gray-200 mb-3" />
            <p className="text-gray-500">暂无数据</p>
          </div>
        ) : (
          <div className="space-y-2">
            {records.map((record) => {
              const sInfo = statusMap[record.status as RecordStatus]
              return (
                <Card
                  key={record.id}
                  className="border-0 shadow-sm cursor-pointer active:scale-[0.98] transition-transform"
                  onClick={() => router.push(`/h5/projects/${table.name}/${record.id}`)}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400 font-mono">#{record.id}</span>
                      <div className="flex items-center gap-2">
                        {attachmentCounts[record.id] > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-gray-400">
                            <Paperclip className="w-3 h-3" />
                            {attachmentCounts[record.id]}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColorMap[sInfo?.variant] || 'bg-gray-100 text-gray-600'}`}>
                          {sInfo?.label}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      {listFields.slice(0, 4).map((field: any) => (
                        <div key={field.id} className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-gray-400 flex-shrink-0">{field.label}:</span>
                          <div className="min-w-0 flex-1">{renderCellValue(record, field)}</div>
                        </div>
                      ))}
                    </div>

                    {listFields.length > 4 && (
                      <p className="text-xs text-gray-400 mt-1.5">
                        还有 {listFields.length - 4} 个字段...
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                      <span className="text-xs text-gray-400">{formatDateTime(record.createdAt)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => openQrModal(record.id, e)}
                          className="flex items-center gap-0.5 px-2 py-1 text-xs text-gray-400 bg-gray-50 rounded-lg"
                          title="查看二维码"
                        >
                          <QrCode className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => openUploadModal(record.id, e)}
                          className="flex items-center gap-0.5 px-2 py-1 text-xs text-primary bg-primary/5 rounded-lg"
                        >
                          <Paperclip className="w-3 h-3" />
                          添加附件
                        </button>
                        <ChevronRight className="w-4 h-4 text-gray-300" />
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-4 mb-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="h-8 rounded-lg"
            >
              上一页
            </Button>
            <span className="text-sm text-gray-500">{page}/{totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="h-8 rounded-lg"
            >
              下一页
            </Button>
          </div>
        )}
      </div>

      {/* 新增按钮 */}
      {canCreate && (
        <div className="fixed bottom-20 right-4 z-20">
          <Button
            size="lg"
            className="w-14 h-14 rounded-full shadow-lg"
            onClick={() => router.push(`/h5/projects/${table.name}/new`)}
          >
            <Plus className="w-6 h-6" />
          </Button>
        </div>
      )}

      {/* 快速上传附件弹窗 */}
      {uploadModal.open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setUploadModal({ open: false, recordId: null })}>
          <div className="w-full max-w-lg bg-white rounded-t-2xl p-5 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">添加附件</h3>
              <button onClick={() => setUploadModal({ open: false, recordId: null })} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm">附件名称 <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="如：身份证正面、合同扫描件、现场照片"
                  value={uploadName}
                  onChange={(e) => { setUploadName(e.target.value); setUploadNameError('') }}
                  className="h-10 text-sm rounded-lg mt-1"
                  autoFocus
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
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm text-gray-500
                    file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
                    file:text-sm file:font-medium file:bg-primary file:text-white"
                />
                {uploadFile && (
                  <p className="text-xs text-gray-500 mt-1">
                    已选：{uploadFile.name} ({(uploadFile.size / 1024 / 1024 > 1 ? (uploadFile.size / 1024 / 1024).toFixed(1) + 'MB' : (uploadFile.size / 1024).toFixed(0) + 'KB')})
                  </p>
                )}
              </div>

              {uploadNameError && <p className="text-sm text-red-500">{uploadNameError}</p>}

              <Button
                onClick={handleQuickUpload}
                disabled={uploading}
                className="w-full h-11 rounded-xl"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />上传中...</>
                ) : (
                  <><Upload className="w-4 h-4 mr-2" />确认上传</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 二维码弹窗 */}
      {qrModal.open && qrModal.recordId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setQrModal({ open: false, recordId: null })}>
          <div className="w-[280px] bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold">记录二维码</h3>
              <button onClick={() => setQrModal({ open: false, recordId: null })} className="p-1">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-gray-500">扫描二维码查看记录详情</p>

              <div className="p-3 bg-white rounded-xl border">
                <QRCodeSVG
                  value={viewUrl(qrModal.recordId)}
                  size={200}
                  level="M"
                />
              </div>

              <p className="text-sm text-gray-500">记录编号：#{qrModal.recordId}</p>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyQrUrl(qrModal.recordId!)}
                className="w-full h-10 rounded-xl"
              >
                {qrCopied ? (
                  <><Check className="w-4 h-4 mr-2" />已复制</>
                ) : (
                  <><Copy className="w-4 h-4 mr-2" />复制链接</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}