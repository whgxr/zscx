"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DynamicForm } from '@/components/dynamic-form'
import { ArrowLeft, Save, Send, ClipboardList, Scale } from 'lucide-react'
import { useTabs, resolveKeyFromHref } from '@/components/layout/tabs-context'
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
  const { prepareLabel } = useTabs()
  // 注册标签标题：新增{表名}
  useEffect(() => {
    prepareLabel(resolveKeyFromHref(window.location.href), `新增${table.label}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [formData, setFormData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)

  // v1.2.3+ 新增记录仅允许填写门禁指定字段：门禁照片 + 配置的 newRecordEditableFields
  const gateField = table.fields.find((f: any) => (f.config as any)?.requireImageUpload)
  const newRecordEditableNames = gateField
    ? [gateField.name, ...(Array.isArray((gateField.config as any)?.newRecordEditableFields) ? (gateField.config as any).newRecordEditableFields : [])]
    : undefined

  const handleSubmit = async (status: RecordStatus = RecordStatus.DRAFT) => {
    // v1.2.2+ 门禁图片：存在门禁字段且未上传时，其它字段被锁定，跳过这些必填校验
    const gateVal = gateField ? formData[gateField.name] : undefined
    const gateEmpty =
      gateVal === undefined || gateVal === null || gateVal === '' ||
      (Array.isArray(gateVal) && gateVal.length === 0)
    const gateLockedNew = !!gateField && gateEmpty

    const requiredFields = table.fields.filter(f => f.required && f.showInForm)
    const missingFields: string[] = []

    requiredFields.forEach(field => {
      // 门禁未解锁时，仅跳过"不在新增记录允许填写范围内"的字段的必填校验；已勾选可填写的字段始终校验
      if (gateLockedNew && !(gateField && field.name === gateField.name) && !(newRecordEditableNames && newRecordEditableNames.includes(field.name))) return
      if (newRecordEditableNames && !newRecordEditableNames.includes(field.name)) return
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
            restrictToFieldNames={newRecordEditableNames}
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
