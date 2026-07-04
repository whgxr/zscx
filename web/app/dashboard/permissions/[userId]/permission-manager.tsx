"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from "@/components/ui/switch"
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Save, Shield } from 'lucide-react'

interface Permission {
  tableId: number
  tableName: string
  tableLabel: string
  canView: boolean
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canExport: boolean
}

interface PermissionManagerProps {
  targetUser: {
    id: number
    username: string
    realName: string
    role: string
  }
  initialPermissions: Permission[]
}

export function PermissionManager({ targetUser, initialPermissions }: PermissionManagerProps) {
  const router = useRouter()
  const [permissions, setPermissions] = useState<Permission[]>(initialPermissions)
  const [loading, setLoading] = useState(false)

  const updatePermission = (tableId: number, field: keyof Permission, value: boolean) => {
    setPermissions(perms => perms.map(p => {
      if (p.tableId === tableId) {
        const updated = { ...p, [field]: value }
        if (field !== 'canView' && value && !p.canView) {
          updated.canView = true
        }
        if (field === 'canView' && !value) {
          updated.canCreate = false
          updated.canEdit = false
          updated.canDelete = false
        }
        return updated
      }
      return p
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/permissions/${targetUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions }),
      })

      if (res.ok) {
        alert('权限保存成功')
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    } finally {
      setLoading(false)
    }
  }

  const isAdmin = targetUser.role === 'ADMIN' || targetUser.role === 'MANAGER'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">权限管理</h1>
            <p className="text-gray-500 mt-1">
              为用户 {targetUser.realName} ({targetUser.username}) 设置数据表权限
            </p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={loading || isAdmin}>
          <Save className="w-4 h-4 mr-2" />
          {loading ? '保存中...' : '保存权限'}
        </Button>
      </div>

      {isAdmin && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-600" />
              <div>
                <p className="font-medium text-blue-800">管理员角色拥有全部权限</p>
                <p className="text-sm text-blue-600">该用户是管理员角色，默认拥有所有数据表的全部权限</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">数据表权限</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">数据表</th>
                  <th className="text-center py-3 px-4 font-medium">查看</th>
                  <th className="text-center py-3 px-4 font-medium">新增</th>
                  <th className="text-center py-3 px-4 font-medium">编辑</th>
                  <th className="text-center py-3 px-4 font-medium">删除</th>
                  <th className="text-center py-3 px-4 font-medium">导出</th>
                </tr>
              </thead>
              <tbody>
                {permissions.map((perm) => (
                  <tr key={perm.tableId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{perm.tableLabel}</div>
                      <div className="text-xs text-gray-500">{perm.tableName}</div>
                    </td>
                    <td className="text-center py-3 px-4">
                      <Switch
                        checked={perm.canView}
                        onCheckedChange={(v) => updatePermission(perm.tableId, 'canView', v)}
                        disabled={isAdmin}
                      />
                    </td>
                    <td className="text-center py-3 px-4">
                      <Switch
                        checked={perm.canCreate}
                        onCheckedChange={(v) => updatePermission(perm.tableId, 'canCreate', v)}
                        disabled={isAdmin || !perm.canView}
                      />
                    </td>
                    <td className="text-center py-3 px-4">
                      <Switch
                        checked={perm.canEdit}
                        onCheckedChange={(v) => updatePermission(perm.tableId, 'canEdit', v)}
                        disabled={isAdmin || !perm.canView}
                      />
                    </td>
                    <td className="text-center py-3 px-4">
                      <Switch
                        checked={perm.canDelete}
                        onCheckedChange={(v) => updatePermission(perm.tableId, 'canDelete', v)}
                        disabled={isAdmin || !perm.canView}
                      />
                    </td>
                    <td className="text-center py-3 px-4">
                      <Switch
                        checked={perm.canExport}
                        onCheckedChange={(v) => updatePermission(perm.tableId, 'canExport', v)}
                        disabled={isAdmin || !perm.canView}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
