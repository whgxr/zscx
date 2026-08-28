"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { PermissionTree } from '@/components/permission-tree'

export function H5AdminPermissionsEditClient({
  targetUser, tree, initialSelected,
}: {
  targetUser: any
  tree: any[]
  initialSelected: string[]
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(initialSelected ?? [])
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/permissions/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedIds: selected }),
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

      <div className="bg-white rounded-xl p-4 shadow-sm mb-3">
        <p className="text-xs text-gray-500 mb-3">
          按「模块 → 分类 → 数据表 → 操作」勾选；勾选父节点自动勾选全部子节点。
        </p>
        <div className="border rounded-lg p-2 max-h-[60vh] overflow-auto bg-slate-50/50">
          <PermissionTree tree={tree as any} value={selected} onChange={setSelected} />
        </div>
      </div>

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
