"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'

export function H5AdminPermissionsEditClient({
  targetUser, tables, permMap,
}: {
  targetUser: any
  tables: any[]
  permMap: Record<number, any>
}) {
  const router = useRouter()
  const [perms, setPerms] = useState<Record<number, { canView: boolean; canCreate: boolean; canEdit: boolean; canDelete: boolean }>>(() => {
    const init: Record<number, any> = {}
    tables.forEach(t => {
      init[t.id] = permMap[t.id] || { canView: false, canCreate: false, canEdit: false, canDelete: false }
    })
    return init
  })
  const [loading, setLoading] = useState(false)

  const toggle = (tableId: number, field: 'canView' | 'canCreate' | 'canEdit' | 'canDelete') => {
    setPerms(prev => ({
      ...prev,
      [tableId]: { ...prev[tableId], [field]: !prev[tableId][field] },
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/permissions/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: targetUser.id,
          permissions: Object.entries(perms).map(([tableId, p]) => ({
            tableId: parseInt(tableId),
            ...p,
          })),
        }),
      })
      if (res.ok) {
        alert('保存成功')
        router.push('/h5/admin/permissions')
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

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.push('/h5/admin/permissions')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">{targetUser.realName || targetUser.username} 的权限</h1>
      </div>

      {tables.map((table: any) => {
        const p = perms[table.id]
        return (
          <div key={table.id} className="bg-white rounded-xl p-4 shadow-sm mb-3">
            <h3 className="text-sm font-medium mb-3">{table.label}</h3>
            <div className="grid grid-cols-4 gap-2">
              {(['canView', 'canCreate', 'canEdit', 'canDelete'] as const).map(field => (
                <label
                  key={field}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-xs cursor-pointer border ${
                    p[field] ? 'bg-primary/5 border-primary text-primary' : 'bg-gray-50 border-gray-200 text-gray-400'
                  }`}
                  onClick={() => toggle(table.id, field)}
                >
                  <span>{field === 'canView' ? '查看' : field === 'canCreate' ? '新增' : field === 'canEdit' ? '编辑' : '删除'}</span>
                  <input type="checkbox" checked={p[field]} readOnly className="hidden" />
                </label>
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex gap-3 mt-4">
        <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => router.push('/h5/admin/permissions')}>
          取消
        </Button>
        <Button className="flex-1 h-11 rounded-xl" onClick={handleSave} disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</> : <><Save className="w-4 h-4 mr-2" />保存</>}
        </Button>
      </div>
    </div>
  )
}