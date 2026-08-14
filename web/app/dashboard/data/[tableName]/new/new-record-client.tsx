"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DynamicForm } from '@/components/dynamic-form'
import { ArrowLeft, Save, Send, ClipboardList, Scale } from 'lucide-react'
import { DataTable, TableField, RecordStatus } from '@prisma/client'

interface NewRecordClientProps {
  table: DataTable & {
    fields: TableField[]
    formLayoutConfig?: any
  }
  module?: string
}

export function NewRecordClient({ table, module: moduleProp = '' }: NewRecordClientProps) {
  const router = useRouter()
  const currentModule = moduleProp || ''
  const moduleQuery = currentModule ? `?module=${currentModule}` : ''
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (status: RecordStatus = RecordStatus.DRAFT) => {
    const requiredFields = table.fields.filter(f => f.required && f.showInForm)
    const missingFields: string[] = []

    requiredFields.forEach(field => {
      const value = formData[field.name]
      if (value === undefined || value === null || value === '' || 
          (Array.isArray(value) && value.length === 0)) {
        missingFields.push(field.label)
      }
    })

    if (missingFields.length > 0) {
      alert(`以下必填项为空，请填写：\n${missingFields.join('\n')}`)
      return
    }

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
        router.push(`/dashboard/data/${table.name}${moduleQuery}`)
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
        <Button variant="ghost" onClick={() => router.push(`/dashboard/data/${table.name}${moduleQuery}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">新增{table.label}</h1>
            {currentModule === 'survey' && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
                <ClipboardList className="w-3 h-3 mr-1" /> 调查中
              </Badge>
            )}
            {currentModule === 'levy' && (
              <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
                <Scale className="w-3 h-3 mr-1" /> 征收中
              </Badge>
            )}
          </div>
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
            module={currentModule === 'survey' ? 'survey' : currentModule === 'levy' ? 'levy' : 'both'}
          />
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t pt-6">
          <Button variant="outline" onClick={() => router.push(`/dashboard/data/${table.name}${moduleQuery}`)}>
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
