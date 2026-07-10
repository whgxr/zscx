"use client"

import { useRouter } from 'next/navigation'
import { ArrowLeft, FileSpreadsheet, ChevronRight, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function H5AdminTemplatesClient({ templates }: { templates: any[] }) {
  const router = useRouter()
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  const categoryLabels: Record<string, string> = {
    EXCEL: 'Excel', PDF: 'PDF', PRINT: '打印', 'EXCEL,PRINT': 'Excel+打印', 'PDF,PRINT': 'PDF+打印',
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">模板管理</h1>
      </div>

      <div className="text-sm text-gray-500 mb-4">
        共 {templates.length} 个模板，点击查看详情
      </div>

      {templates.map((t: any, idx: number) => (
        <div key={t.id} className="bg-white rounded-xl shadow-sm mb-2 overflow-hidden">
          <div className="p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setPreviewIndex(previewIndex === idx ? null : idx)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name}</p>
                  <p className="text-xs text-gray-400">
                    {t.table?.label} · {categoryLabels[t.category] || t.category}
                  </p>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform flex-shrink-0 ${previewIndex === idx ? 'rotate-90' : ''}`} />
            </div>

            {/* 展开预览 */}
            {previewIndex === idx && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1">模板描述</p>
                  <p className="text-sm text-gray-600">{t.description || '无描述'}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">类型</p>
                    <p className="text-sm font-medium">{t.category}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">是否默认</p>
                    <p className="text-sm font-medium">{t.isDefault ? '是' : '否'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">系统模板</p>
                    <p className="text-sm font-medium">{t.isSystem ? '是' : '否'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-400">更新时间</p>
                    <p className="text-sm font-medium">{new Date(t.updatedAt).toLocaleDateString('zh-CN')}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={`/dashboard/export-templates/${t.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    在PC端编辑
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}