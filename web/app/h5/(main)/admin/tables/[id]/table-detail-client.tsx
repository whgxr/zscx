"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Plus, X, Loader2, Pencil, Trash2 } from 'lucide-react'

const FIELD_TYPES = [
  { value: 'TEXT', label: '文本' },
  { value: 'TEXTAREA', label: '多行文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'INTEGER', label: '整数' },
  { value: 'FLOAT', label: '小数' },
  { value: 'MONEY', label: '金额' },
  { value: 'DATE', label: '日期' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'PHONE', label: '手机号' },
  { value: 'EMAIL', label: '邮箱' },
  { value: 'IDCARD', label: '身份证' },
  { value: 'SELECT', label: '下拉选择' },
  { value: 'RADIO', label: '单选' },
  { value: 'MULTISELECT', label: '多选' },
  { value: 'CHECKBOX', label: '复选框' },
  { value: 'SWITCH', label: '开关' },
  { value: 'UPLOAD_IMAGE', label: '图片上传' },
  { value: 'UPLOAD_FILE', label: '文件上传' },
  { value: 'ADDRESS', label: '地址' },
]

export function H5AdminTableDetailClient({ table: initialTable }: { table: any }) {
  const router = useRouter()
  const [table, setTable] = useState(initialTable)
  const [showFieldForm, setShowFieldForm] = useState(false)
  const [editingField, setEditingField] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [fieldForm, setFieldForm] = useState({
    name: '', label: '', type: 'TEXT', required: false, showInForm: true, showInList: true,
  })

  const openCreateField = () => {
    setEditingField(null)
    setFieldForm({ name: '', label: '', type: 'TEXT', required: false, showInForm: true, showInList: true })
    setShowFieldForm(true)
  }

  const openEditField = (field: any) => {
    setEditingField(field)
    setFieldForm({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      showInForm: field.showInForm,
      showInList: field.showInList,
    })
    setShowFieldForm(true)
  }

  const handleSaveField = async () => {
    if (!fieldForm.name.trim() || !fieldForm.label.trim()) {
      alert('请填写字段名和标签')
      return
    }
    setLoading(true)
    try {
      const url = editingField
        ? `/api/tables/${table.id}/fields/${editingField.id}`
        : `/api/tables/${table.id}/fields`
      const method = editingField ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldForm),
      })

      if (res.ok) {
        const data = await res.json()
        if (editingField) {
          setTable((prev: any) => ({
            ...prev,
            fields: prev.fields.map((f: any) => f.id === editingField.id ? { ...f, ...fieldForm } : f),
          }))
        } else {
          setTable((prev: any) => ({
            ...prev,
            fields: [...prev.fields, data.field || { ...fieldForm, id: Date.now() }],
          }))
        }
        setShowFieldForm(false)
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

  const handleDeleteField = async (fieldId: number) => {
    if (!confirm('确定删除此字段？')) return
    try {
      const res = await fetch(`/api/tables/${table.id}/fields/${fieldId}`, { method: 'DELETE' })
      if (res.ok) {
        setTable((prev: any) => ({
          ...prev,
          fields: prev.fields.filter((f: any) => f.id !== fieldId),
        }))
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch {
      alert('删除失败')
    }
  }

  return (
    <div className="px-4 pt-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <a href="/h5/admin/tables" className="p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </a>
          <h1 className="text-lg font-semibold">{table.label}</h1>
        </div>
      </div>

      {/* 基本信息 */}
      <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
        <h3 className="text-sm font-medium mb-3">基本信息</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-400">表名</p><p>{table.name}</p></div>
          <div><p className="text-xs text-gray-400">记录数</p><p>{table._count.records}</p></div>
          <div><p className="text-xs text-gray-400">状态</p><p>{table.status}</p></div>
          <div><p className="text-xs text-gray-400">明细表</p><p>{table.isDetailTable ? '是' : '否'}</p></div>
        </div>
      </div>

      {/* 字段列表 */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">字段列表 ({table.fields.length})</h3>
          <Button size="sm" className="h-8 rounded-lg" onClick={openCreateField}>
            <Plus className="w-4 h-4 mr-1" />新增字段
          </Button>
        </div>
        <div className="space-y-1">
          {table.fields.map((field: any) => (
            <div key={field.id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
              <div className="flex-1 min-w-0" onClick={() => openEditField(field)}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{field.label}</span>
                  {field.required && <span className="text-red-400 text-xs">*</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-gray-400">{field.name}</span>
                  <span className="text-[10px] px-1 py-0.5 bg-gray-100 rounded text-gray-500">{field.type}</span>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button onClick={(e) => { e.stopPropagation(); openEditField(field) }} className="p-1.5 text-gray-400 hover:text-primary">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDeleteField(field.id) }} className="p-1.5 text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 新增/编辑字段弹窗 */}
      {showFieldForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setShowFieldForm(false)}>
          <div className="w-full max-w-lg bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold">{editingField ? '编辑字段' : '新增字段'}</h3>
              <button onClick={() => setShowFieldForm(false)} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-sm">字段名（英文）<span className="text-red-500">*</span></Label>
                <Input placeholder="如：house_address" value={fieldForm.name} disabled={!!editingField}
                  onChange={(e) => setFieldForm({ ...fieldForm, name: e.target.value })}
                  className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-sm">标签（中文）<span className="text-red-500">*</span></Label>
                <Input placeholder="如：房屋地址" value={fieldForm.label}
                  onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })}
                  className="h-10 text-sm rounded-lg mt-1" />
              </div>
              <div>
                <Label className="text-sm">字段类型</Label>
                <select value={fieldForm.type}
                  onChange={(e) => setFieldForm({ ...fieldForm, type: e.target.value })}
                  className="w-full h-10 px-3 text-sm border border-gray-200 rounded-lg bg-white mt-1">
                  {FIELD_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={fieldForm.required}
                    onChange={(e) => setFieldForm({ ...fieldForm, required: e.target.checked })}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm">必填</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={fieldForm.showInForm}
                    onChange={(e) => setFieldForm({ ...fieldForm, showInForm: e.target.checked })}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm">表单显示</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={fieldForm.showInList}
                    onChange={(e) => setFieldForm({ ...fieldForm, showInList: e.target.checked })}
                    className="w-4 h-4 rounded accent-primary" />
                  <span className="text-sm">列表显示</span>
                </label>
              </div>
              <Button onClick={handleSaveField} disabled={loading} className="w-full h-11 rounded-xl">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />保存中...</> : (editingField ? '保存修改' : '确认新增')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}