"use client"

import { useRouter } from 'next/navigation'
import { ArrowLeft, Database, ChevronRight, Table2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function H5AdminTablesClient({ tables }: { tables: any[] }) {
  const router = useRouter()

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">项目管理</h1>
      </div>

      <div className="text-sm text-gray-500 mb-4">
        共 {tables.length} 个数据表，点击可查看详情
      </div>

      <div className="space-y-2">
        {tables.map((table: any) => (
          <div
            key={table.id}
            className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between"
            onClick={() => router.push(`/h5/admin/tables/${table.id}`)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Table2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{table.label}</p>
                <p className="text-xs text-gray-400">
                  {table._count.records} 条记录
                  {table.isDetailTable && <span className="ml-1 text-orange-500">[明细表]</span>}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        ))}
      </div>
    </div>
  )
}