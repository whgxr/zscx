"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { DynamicForm } from '@/components/dynamic-form'
import { ArrowLeft, Save, Send } from 'lucide-react'
import { DataTable, TableField, RecordStatus } from '@prisma/client'

interface NewRecordClientProps {
  table: DataTable & {
    fields: TableField[]
    formLayoutConfig?: any
  }
}

export function NewRecordClient({ table }: NewRecordClientProps) {
  const router = useRouter()
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (status: RecordStatus = RecordStatus.DRAFT) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/data/${table.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: formData,
          status,
        }),
      })

      if (res.ok) {
        router.push(`/dashboard/data/${table.name}`)
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">新增{table.label}</h1>
          <p className="text-gray-500 mt-1">填写以下信息</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">基本信息</CardTitle>
        </CardHeader>
        <CardContent>
          <DynamicForm
            fields={table.fields}
            values={formData}
            onChange={setFormData}
            layoutConfig={table.formLayoutConfig}
          />
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t pt-6">
          <Button variant="outline" onClick={() => router.back()}>
            取消
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSubmit(RecordStatus.DRAFT)}
            disabled={loading}
          >
            <Save className="w-4 h-4 mr-2" />
            保存草稿
          </Button>
          <Button
            onClick={() => handleSubmit(RecordStatus.SUBMITTED)}
            disabled={loading}
          >
            <Send className="w-4 h-4 mr-2" />
            提交
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
