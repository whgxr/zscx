"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DynamicForm } from '@/components/dynamic-form'
import { ArrowLeft, Edit, Save, X } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { DataTable, TableField, DataRecord, RecordStatus } from '@prisma/client'

const statusMap: Record<RecordStatus, { label: string; variant: string }> = {
  DRAFT: { label: '草稿', variant: 'secondary' },
  SUBMITTED: { label: '已提交', variant: 'default' },
  REVIEWED: { label: '已审核', variant: 'success' },
  REJECTED: { label: '已驳回', variant: 'destructive' },
  ARCHIVED: { label: '已归档', variant: 'outline' },
}

interface RecordDetailClientProps {
  table: DataTable & {
    fields: TableField[]
  }
  record: DataRecord & {
    creator?: {
      id: number
      realName: string | null
      username: string
    } | null
  }
}

export function RecordDetailClient({ table, record }: RecordDetailClientProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState<Record<string, any>>(record.data as any || {})
  const [loading, setLoading] = useState(false)

  const statusInfo = statusMap[record.status as RecordStatus]

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">记录详情 #{record.id}</h1>
              <Badge variant={statusInfo?.variant as any}>{statusInfo?.label}</Badge>
            </div>
            <p className="text-gray-500 mt-1">
              {table.label} · 创建于 {formatDateTime(record.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>
                <X className="w-4 h-4 mr-2" />
                取消
              </Button>
              <Button onClick={handleSave} disabled={loading}>
                <Save className="w-4 h-4 mr-2" />
                保存
              </Button>
            </>
          ) : (
            <Button onClick={() => setIsEditing(true)}>
              <Edit className="w-4 h-4 mr-2" />
              编辑
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isEditing ? '编辑信息' : '详细信息'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DynamicForm
              fields={table.fields}
              values={formData}
              onChange={setFormData}
              disabled={!isEditing}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">记录信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">创建人</p>
              <p className="font-medium mt-1">
                {record.creator?.realName || record.creator?.username || '-'}
              </p>
            </div>
            <div>
              <p className="text-gray-500">创建时间</p>
              <p className="font-medium mt-1">{formatDateTime(record.createdAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">更新时间</p>
              <p className="font-medium mt-1">{formatDateTime(record.updatedAt)}</p>
            </div>
            <div>
              <p className="text-gray-500">所属表</p>
              <p className="font-medium mt-1">{table.label}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
