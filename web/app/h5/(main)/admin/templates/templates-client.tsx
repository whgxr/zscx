"use client"

import { useRouter } from 'next/navigation'
import { ArrowLeft, FileSpreadsheet, ChevronRight, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function H5AdminTemplatesClient({ templates }: { templates: any[] }) {
  const router = useRouter()

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">模板管理</h1>
      </div>

      <div className="text-sm text-gray-500 mb-4">
        共 {templates.length} 个模板，用于导出Excel/PDF
      </div>

      {templates.length === 0 ? (
        <div className="text-center py-16">
          <FileSpreadsheet className="w-16 h-16 mx-auto text-gray-200 mb-3" />
          <p className="text-gray-500">暂无模板</p>
          <p className="text-gray-400 text-sm mt-1">请在PC端管理后台创建模板</p>
        </div>
      ) : (
        <div className="space-y-2">
          {templates.map((t: any) => (
            <div key={t.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-gray-400">
                      {t.table?.label} · {t.category === 'EXCEL' ? 'Excel' : t.category === 'PDF' ? 'PDF' : t.category}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}