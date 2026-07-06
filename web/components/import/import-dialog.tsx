"use client"

import { useState, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { DataTable, TableField } from '@prisma/client'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  table: DataTable & {
    fields: TableField[]
  }
  onImportSuccess?: () => void
}

interface ImportResult {
  success: number
  failed: number
  total: number
  errors: { row: number; message: string }[]
}

export function ImportDialog({ open, onOpenChange, table, onImportSuccess }: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) return
    if (!selectedFile.name.endsWith('.xlsx') && !selectedFile.name.endsWith('.xls')) {
      alert('请选择Excel文件 (.xlsx 或 .xls)')
      return
    }
    setFile(selectedFile)
    setResult(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const handleDownloadTemplate = () => {
    window.open(`/api/import/${table.name}`, '_blank')
  }

  const handleImport = async () => {
    if (!file) {
      alert('请选择要导入的Excel文件')
      return
    }

    setImporting(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/import/${table.name}`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setResult(data)
        if (data.success > 0 && onImportSuccess) {
          onImportSuccess()
        }
      } else {
        let errorMsg = '导入失败'
        try {
          const json = await res.json()
          if (json.message) errorMsg = json.message
        } catch (e) {
          errorMsg = `导入失败 (${res.status})`
        }
        alert(errorMsg)
      }
    } catch (err: any) {
      alert(`导入失败: ${err.message || err}`)
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setFile(null)
    setResult(null)
    onOpenChange(false)
  }

  const resetImport = () => {
    setFile(null)
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>导入数据</DialogTitle>
          <DialogDescription>
            从Excel文件导入数据到 {table.label}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!result ? (
            <>
              <div
                className={
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ' +
                  (dragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-200 hover:border-gray-300')
                }
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="w-12 h-12 mx-auto text-primary" />
                    <div className="font-medium text-gray-900">{file.name}</div>
                    <div className="text-sm text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        resetImport()
                      }}
                    >
                      重新选择
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-gray-400" />
                    <div className="font-medium text-gray-900">
                      点击或拖拽文件到此处
                    </div>
                    <div className="text-sm text-gray-500">
                      支持 .xlsx, .xls 格式
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                >
                  <Download className="w-4 h-4 mr-2" />
                  下载导入模板
                </Button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">导入说明：</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-700">
                      <li>第一行为表头，需与字段名匹配</li>
                      <li>如果包含"ID"列，则更新对应记录</li>
                      <li>没有ID列时，新增记录</li>
                      <li>状态可选值：草稿、已提交、已审核、已驳回、已归档</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{result.total}</div>
                  <div className="text-sm text-gray-500">总计</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{result.success}</div>
                  <div className="text-sm text-green-600">成功</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                  <div className="text-sm text-red-600">失败</div>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-red-50 px-3 py-2 border-b">
                    <span className="text-sm font-medium text-red-800">
                      错误详情（前20条）
                    </span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {result.errors.slice(0, 20).map((error, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 border-b last:border-b-0 flex items-start gap-2"
                      >
                        <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          {error.row > 0 && (
                            <span className="text-gray-500">第 {error.row} 行：</span>
                          )}
                          <span className="text-gray-700">{error.message}</span>
                        </div>
                      </div>
                    ))}
                    {result.errors.length > 20 && (
                      <div className="px-3 py-2 text-sm text-gray-500 text-center">
                        还有 {result.errors.length - 20} 条错误未显示
                      </div>
                    )}
                  </div>
                </div>
              )}

              {result.failed === 0 && (
                <div className="flex items-center justify-center gap-2 text-green-600 py-2">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="font-medium">全部导入成功！</span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                取消
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || !file}
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    导入中...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    开始导入
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={resetImport}>
                继续导入
              </Button>
              <Button onClick={handleClose}>
                完成
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
