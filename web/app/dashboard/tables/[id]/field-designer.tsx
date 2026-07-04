"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { 
  Plus, 
  ArrowUp, 
  ArrowDown, 
  Edit, 
  Trash2, 
  ArrowLeft,
  GripVertical,
  Type,
  Hash,
  Calendar,
  List,
  Image,
  FileText,
  Phone,
  Mail,
  CreditCard,
  MapPin,
  DollarSign,
  ToggleLeft,
  AlignLeft,
  Pencil,
} from 'lucide-react'
import { FieldType, DataTable, TableField, Role } from '@prisma/client'

interface FieldDesignerProps {
  table: DataTable & {
    fields: TableField[]
  }
  userRole: Role
}

const fieldTypeConfig: Record<FieldType, { label: string; icon: any }> = {
  TEXT: { label: '单行文本', icon: Type },
  TEXTAREA: { label: '多行文本', icon: AlignLeft },
  NUMBER: { label: '数字', icon: Hash },
  INTEGER: { label: '整数', icon: Hash },
  FLOAT: { label: '小数', icon: Hash },
  DATE: { label: '日期', icon: Calendar },
  DATETIME: { label: '日期时间', icon: Calendar },
  SELECT: { label: '单选下拉', icon: List },
  RADIO: { label: '单选按钮', icon: List },
  MULTISELECT: { label: '多选', icon: List },
  CHECKBOX: { label: '复选框', icon: ToggleLeft },
  UPLOAD_IMAGE: { label: '图片上传', icon: Image },
  UPLOAD_FILE: { label: '文件上传', icon: FileText },
  PHONE: { label: '手机号', icon: Phone },
  EMAIL: { label: '邮箱', icon: Mail },
  IDCARD: { label: '身份证号', icon: CreditCard },
  ADDRESS: { label: '地址', icon: MapPin },
  MONEY: { label: '金额', icon: DollarSign },
  SWITCH: { label: '开关', icon: ToggleLeft },
  RICHTEXT: { label: '富文本', icon: AlignLeft },
  RELATION: { label: '关联表', icon: Table },
}

export function FieldDesigner({ table, userRole }: FieldDesignerProps) {
  const router = useRouter()
  const [fields, setFields] = useState<TableField[]>(table.fields)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<TableField | null>(null)
  const [loading, setLoading] = useState(false)
  const [tableEditOpen, setTableEditOpen] = useState(false)
  const [tableForm, setTableForm] = useState({
    name: table.name,
    label: table.label,
  })
  const [tableEditLoading, setTableEditLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    type: 'TEXT' as FieldType,
    required: false,
    placeholder: '',
    showInList: true,
    showInForm: true,
    showInSearch: true,
  })

  const openCreateDialog = () => {
    setEditingField(null)
    setFormData({
      name: '',
      label: '',
      type: 'TEXT',
      required: false,
      placeholder: '',
      showInList: true,
      showInForm: true,
      showInSearch: true,
    })
    setDialogOpen(true)
  }

  const openEditDialog = (field: TableField) => {
    setEditingField(field)
    setFormData({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder || '',
      showInList: field.showInList,
      showInForm: field.showInForm,
      showInSearch: field.showInSearch,
    })
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.label) return

    setLoading(true)
    try {
      const url = editingField
        ? `/api/tables/${table.id}/fields/${editingField.id}`
        : `/api/tables/${table.id}/fields`
      const method = editingField ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (res.ok) {
        setDialogOpen(false)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '操作失败')
      }
    } catch (err) {
      alert('操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (fieldId: number) => {
    if (!confirm('确定要删除这个字段吗？')) return

    try {
      const res = await fetch(`/api/tables/${table.id}/fields/${fieldId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '删除失败')
      }
    } catch (err) {
      alert('删除失败')
    }
  }

  const handleUpdateTable = async () => {
    setTableEditLoading(true)
    try {
      const res = await fetch(`/api/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tableForm),
      })

      if (res.ok) {
        setTableEditOpen(false)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '修改失败')
      }
    } catch (err) {
      alert('修改失败')
    } finally {
      setTableEditLoading(false)
    }
  }

  const typeInfo = fieldTypeConfig[formData.type]
  const TypeIcon = typeInfo?.icon || Type

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">字段设计 - {table.label}</h1>
          <p className="text-gray-500 mt-1">表名: {table.name}</p>
        </div>
        {userRole === 'ADMIN' && (
          <Dialog open={tableEditOpen} onOpenChange={setTableEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-2" />
                修改表名
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>修改数据表信息</DialogTitle>
                <DialogDescription>
                  只有系统管理员可以修改表名和显示名称
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="table-name">表名（英文标识）</Label>
                  <Input
                    id="table-name"
                    placeholder="如：household_info"
                    value={tableForm.name}
                    onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })}
                  />
                  <p className="text-xs text-gray-500">
                    只能包含字母、数字和下划线，且以字母开头
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="table-label">显示名称</Label>
                  <Input
                    id="table-label"
                    placeholder="如：住户信息表"
                    value={tableForm.label}
                    onChange={(e) => setTableForm({ ...tableForm, label: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTableEditOpen(false)}>
                  取消
                </Button>
                <Button
                  onClick={handleUpdateTable}
                  disabled={tableEditLoading || !tableForm.name || !tableForm.label}
                >
                  {tableEditLoading ? '保存中...' : '保存'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">字段列表</CardTitle>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openCreateDialog}>
                    <Plus className="w-4 h-4 mr-2" />
                    添加字段
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingField ? '编辑字段' : '添加字段'}
                    </DialogTitle>
                    <DialogDescription>
                      配置字段的基本信息和显示选项
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-2 gap-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="field-name">字段名（英文标识）</Label>
                      <Input
                        id="field-name"
                        placeholder="如：name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={!!editingField?.isSystem}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="field-label">显示名称</Label>
                      <Input
                        id="field-label"
                        placeholder="如：姓名"
                        value={formData.label}
                        onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="field-type">字段类型</Label>
                      <Select
                        value={formData.type}
                        onValueChange={(v) => setFormData({ ...formData, type: v as FieldType })}
                      >
                        <SelectTrigger id="field-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(fieldTypeConfig).map(([key, config]) => {
                            const Icon = config.icon
                            return (
                              <SelectItem key={key} value={key}>
                                <div className="flex items-center gap-2">
                                  <Icon className="w-4 h-4" />
                                  {config.label}
                                </div>
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="field-placeholder">输入提示（可选）</Label>
                      <Input
                        id="field-placeholder"
                        placeholder="请输入..."
                        value={formData.placeholder}
                        onChange={(e) => setFormData({ ...formData, placeholder: e.target.value })}
                      />
                    </div>
                    <div className="col-span-2 space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">必填字段</p>
                          <p className="text-xs text-gray-500">表单中是否必须填写</p>
                        </div>
                        <Switch
                          checked={formData.required}
                          onCheckedChange={(v) => setFormData({ ...formData, required: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">列表显示</p>
                          <p className="text-xs text-gray-500">是否在数据列表中显示</p>
                        </div>
                        <Switch
                          checked={formData.showInList}
                          onCheckedChange={(v) => setFormData({ ...formData, showInList: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">表单显示</p>
                          <p className="text-xs text-gray-500">是否在录入表单中显示</p>
                        </div>
                        <Switch
                          checked={formData.showInForm}
                          onCheckedChange={(v) => setFormData({ ...formData, showInForm: v })}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">可搜索</p>
                          <p className="text-xs text-gray-500">是否可以作为搜索条件</p>
                        </div>
                        <Switch
                          checked={formData.showInSearch}
                          onCheckedChange={(v) => setFormData({ ...formData, showInSearch: v })}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                      {loading ? '保存中...' : '保存'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>字段名</TableHead>
                    <TableHead>显示名称</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>必填</TableHead>
                    <TableHead>显示设置</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.length > 0 ? (
                    fields.map((field) => {
                      const ft = fieldTypeConfig[field.type]
                      const FIcon = ft?.icon || Type
                      return (
                        <TableRow key={field.id}>
                          <TableCell>
                            <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                          </TableCell>
                          <TableCell className="font-medium">{field.name}</TableCell>
                          <TableCell>{field.label}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <FIcon className="w-4 h-4 text-gray-400" />
                              <span className="text-sm">{ft?.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {field.required && (
                              <Badge variant="destructive" className="text-xs">必填</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {field.showInList && <Badge variant="outline" className="text-xs">列表</Badge>}
                              {field.showInForm && <Badge variant="outline" className="text-xs">表单</Badge>}
                              {field.showInSearch && <Badge variant="outline" className="text-xs">搜索</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditDialog(field)}
                                disabled={field.isSystem}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-600"
                                onClick={() => handleDelete(field.id)}
                                disabled={field.isSystem}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-gray-500">
                        <Type className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>暂无字段，点击上方添加字段</p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">字段类型说明</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(fieldTypeConfig).slice(0, 10).map(([key, config]) => {
                  const Icon = config.icon
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span>{config.label}</span>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">预览</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <TypeIcon className="w-5 h-5 text-primary" />
                  <span className="font-medium">{formData.label || '字段名称'}</span>
                  {formData.required && <span className="text-red-500">*</span>}
                </div>
                <Input placeholder={formData.placeholder || '请输入...'} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
