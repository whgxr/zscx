"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Table2, Plus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function H5AdminTablesClient({ tables }: { tables: any[] }) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [newTable, setNewTable] = useState({ name: '', label: '', description: '' })
  const [loading, setLoading] = useState(false)

  const handleCreateTable = async () => {
    if (!newTable.name.trim() || !newTable.label.trim()) {
      alert('请填写表名和标签')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTable.name.trim(),
          label: newTable.label.trim(),
          description: newTable.description.trim(),
          status: 'ACTIVE',
        }),
      })
      if (res.ok) {
        alert('创建成功')
        setShowCreate(false)
        setNewTable({ name: '', label: '', description: '' })
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '创建失败')
      }
    } catch {
      alert('创建失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/settings')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">项目管理</h1>
        </div>
        <Button size="sm" className="h-8 rounded-lg" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1" />新增
        </Button>
      </div>

      {/* 新增弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-lg bg-white rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">新增项目表</h3>
              <button onClick={() => setShowCreate(false)} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">表名（英文）<span className="text-red-500">*</span></Label>
                <Input placeholder="如：house_survey" value={newTable.name} onChange={(e) => setNewTable({ ...newTable, name: e.target.value })} className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-sm">标签（中文）<span className="text-red-500">*</span></Label>
                <Input placeholder="如：房屋调查表" value={newTable.label} onChange={(e) => setNewTable({ ...newTable, label: e.target.value })} className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-sm">描述</Label>
                <Input placeholder="可选" value={newTable.description} onChange={(e) => setNewTable({ ...newTable, description: e.target.value })} className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <Button onClick={handleCreateTable} disabled={loading} className="w-full h-11 rounded-xl">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />创建中...</> : '确认创建'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="text-sm text-gray-500 mb-4">共 {tables.length} 个数据表</div>

      <div className="space-y-2">
        {tables.map((table: any) => (
          <div
            key={table.id}
            className="bg-white rounded-xl p-4 shadow-sm flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform"
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