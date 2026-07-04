"use client"

import { useState, useRef } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
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
  Upload,
  Download,
} from 'lucide-react'
import { FieldType, DataTable, TableField, Role } from '@prisma/client'
import * as ExcelJS from 'exceljs'

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

interface ImportField {
  name: string
  label: string
  type: FieldType
  required: boolean
  showInList: boolean
  showInForm: boolean
  showInSearch: boolean
}

export function FieldDesigner({ table, userRole }: FieldDesignerProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importFields, setImportFields] = useState<ImportField[]>([])
  const [importMethod, setImportMethod] = useState<'excel' | 'text'>('text')
  const [importText, setImportText] = useState('')
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
  }

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      return
    }

    const newFields = [...fields]
    const [draggedField] = newFields.splice(draggedIndex, 1)
    newFields.splice(dropIndex, 0, draggedField)
    setFields(newFields)
    setDraggedIndex(null)
    setDragOverIndex(null)

    try {
      const fieldIds = newFields.map((f) => f.id)
      const res = await fetch(`/api/tables/${table.id}/fields/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldIds }),
      })

      if (!res.ok) {
        const data = await res.json()
        alert(data.message || '排序失败')
        setFields(table.fields)
      }
    } catch (err) {
      alert('排序失败')
      setFields(table.fields)
    }
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const openImportDialog = () => {
    setImportFields([])
    setImportText('')
    setImportMethod('text')
    setImportDialogOpen(true)
  }

  const parseImportText = () => {
    if (!importText.trim()) {
      alert('请输入字段信息')
      return
    }

    const lines = importText.trim().split('\n')
    const parsed: ImportField[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const parts = trimmed.split(/[,，\t]/).map((s) => s.trim())
      if (parts.length < 2) continue

      const [name, label, typeStr, requiredStr, showInListStr, showInFormStr, showInSearchStr] = parts

      let type: FieldType = 'TEXT'
      const typeUpper = (typeStr || '').toUpperCase()
      if (typeUpper && Object.values(FieldType).includes(typeUpper as FieldType)) {
        type = typeUpper as FieldType
      }

      parsed.push({
        name: name || '',
        label: label || '',
        type,
        required: requiredStr === '是' || requiredStr === 'true' || requiredStr === '1',
        showInList: showInListStr !== '否' && showInListStr !== 'false' && showInListStr !== '0',
        showInForm: showInFormStr !== '否' && showInFormStr !== 'false' && showInFormStr !== '0',
        showInSearch: showInSearchStr !== '否' && showInSearchStr !== 'false' && showInSearchStr !== '0',
      })
    }

    if (parsed.length === 0) {
      alert('未解析到有效字段，请检查格式')
      return
    }

    setImportFields(parsed)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const buffer = await file.arrayBuffer()
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)

      const worksheet = workbook.worksheets[0]
      if (!worksheet) {
        alert('Excel 文件中没有工作表')
        return
      }

      const parsed: ImportField[] = []
      const rows = worksheet.getRows(2, worksheet.rowCount - 1) || []

      for (const row of rows) {
        const name = String(row.getCell(1).value || '').trim()
        const label = String(row.getCell(2).value || '').trim()
        const typeStr = String(row.getCell(3).value || 'TEXT').trim().toUpperCase()
        const requiredStr = String(row.getCell(4).value || '').trim()
        const showInListStr = String(row.getCell(5).value || '是').trim()
        const showInFormStr = String(row.getCell(6).value || '是').trim()
        const showInSearchStr = String(row.getCell(7).value || '是').trim()

        if (!name || !label) continue

        let type: FieldType = 'TEXT'
        if (Object.values(FieldType).includes(typeStr as FieldType)) {
          type = typeStr as FieldType
        }

        parsed.push({
          name,
          label,
          type,
          required: requiredStr === '是' || requiredStr === 'true' || requiredStr === '1',
          showInList: showInListStr !== '否' && showInListStr !== 'false' && showInListStr !== '0',
          showInForm: showInFormStr !== '否' && showInFormStr !== 'false' && showInFormStr !== '0',
          showInSearch: showInSearchStr !== '否' && showInSearchStr !== 'false' && showInSearchStr !== '0',
        })
      }

      if (parsed.length === 0) {
        alert('未解析到有效字段，请检查 Excel 格式')
        return
      }

      setImportFields(parsed)
    } catch (err) {
      console.error('Parse Excel error:', err)
      alert('解析 Excel 文件失败')
    }
  }

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('字段导入模板')

    worksheet.columns = [
      { header: '字段名(英文)', key: 'name', width: 20 },
      { header: '显示名称', key: 'label', width: 20 },
      { header: '类型', key: 'type', width: 15 },
      { header: '必填(是/否)', key: 'required', width: 12 },
      { header: '列表显示(是/否)', key: 'showInList', width: 15 },
      { header: '表单显示(是/否)', key: 'showInForm', width: 15 },
      { header: '可搜索(是/否)', key: 'showInSearch', width: 15 },
    ]

    worksheet.addRow({
      name: 'name',
      label: '姓名',
      type: 'TEXT',
      required: '是',
      showInList: '是',
      showInForm: '是',
      showInSearch: '是',
    })
    worksheet.addRow({
      name: 'age',
      label: '年龄',
      type: 'INTEGER',
      required: '否',
      showInList: '是',
      showInForm: '是',
      showInSearch: '否',
    })

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    }

    const typeSheet = workbook.addWorksheet('字段类型说明')

    typeSheet.columns = [
      { header: '类型名称', key: 'type', width: 20 },
      { header: '显示名称', key: 'label', width: 15 },
      { header: '说明', key: 'description', width: 50 },
    ]

    const fieldTypeDescriptions = [
      { type: 'TEXT', label: '单行文本', description: '短文本内容，如姓名、标题等' },
      { type: 'TEXTAREA', label: '多行文本', description: '长文本内容，如备注、描述等' },
      { type: 'NUMBER', label: '数字', description: '普通数字，支持小数' },
      { type: 'INTEGER', label: '整数', description: '整数数字，不支持小数' },
      { type: 'FLOAT', label: '小数', description: '浮点数，支持多位小数' },
      { type: 'MONEY', label: '金额', description: '货币金额，保留2位小数' },
      { type: 'DATE', label: '日期', description: '日期选择，格式 YYYY-MM-DD' },
      { type: 'DATETIME', label: '日期时间', description: '日期时间选择，格式 YYYY-MM-DD HH:mm:ss' },
      { type: 'SELECT', label: '单选下拉', description: '下拉框选择，单选一个选项' },
      { type: 'RADIO', label: '单选按钮', description: '单选按钮组，单选一个选项' },
      { type: 'MULTISELECT', label: '多选', description: '多选下拉框，可选择多个选项' },
      { type: 'CHECKBOX', label: '复选框', description: '复选框组，可勾选多个' },
      { type: 'SWITCH', label: '开关', description: '开关/是/否选项' },
      { type: 'UPLOAD_IMAGE', label: '图片上传', description: '上传图片文件，支持多图' },
      { type: 'UPLOAD_FILE', label: '文件上传', description: '上传任意文件，支持多文件' },
      { type: 'PHONE', label: '手机号', description: '手机号码输入，自动校验格式' },
      { type: 'EMAIL', label: '邮箱', description: '邮箱地址输入，自动校验格式' },
      { type: 'IDCARD', label: '身份证号', description: '身份证号码输入，自动校验格式' },
      { type: 'ADDRESS', label: '地址', description: '地址文本输入' },
      { type: 'RICHTEXT', label: '富文本', description: '富文本编辑器，支持图文混排' },
      { type: 'RELATION', label: '关联表', description: '关联其他数据表的记录' },
    ]

    fieldTypeDescriptions.forEach(item => {
      typeSheet.addRow(item)
    })

    const typeHeaderRow = typeSheet.getRow(1)
    typeHeaderRow.font = { bold: true }
    typeHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '字段导入模板.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (importFields.length === 0) {
      alert('请先解析或上传字段数据')
      return
    }

    setImportLoading(true)
    try {
      const res = await fetch(`/api/tables/${table.id}/fields/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: importFields }),
      })

      if (res.ok) {
        setImportDialogOpen(false)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '导入失败')
      }
    } catch (err) {
      alert('导入失败')
    } finally {
      setImportLoading(false)
    }
  }

  const removeImportField = (index: number) => {
    setImportFields(importFields.filter((_, i) => i !== index))
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
          <p className="text-gray-500 mt-1">项目名: {table.name}</p>
        </div>
        {userRole === 'ADMIN' && (
          <Dialog open={tableEditOpen} onOpenChange={setTableEditOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Pencil className="w-4 h-4 mr-2" />
                修改项目名
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>修改项目信息</DialogTitle>
                <DialogDescription>
                  只有系统管理员可以修改项目名和显示名称
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="table-name">项目名（英文标识）</Label>
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
              <CardTitle className="text-lg">字段列表（拖拽可排序）</CardTitle>
              <div className="flex items-center gap-2">
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={openImportDialog}>
                      <Upload className="w-4 h-4 mr-2" />
                      批量导入
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>批量导入字段</DialogTitle>
                      <DialogDescription>
                        通过文本或 Excel 批量导入字段
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="flex gap-2">
                        <Button
                          variant={importMethod === 'text' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setImportMethod('text')}
                        >
                          文本导入
                        </Button>
                        <Button
                          variant={importMethod === 'excel' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setImportMethod('excel')}
                        >
                          Excel 导入
                        </Button>
                        <Button variant="outline" size="sm" onClick={downloadTemplate}>
                          <Download className="w-4 h-4 mr-2" />
                          下载模板
                        </Button>
                      </div>

                      {importMethod === 'text' && (
                        <div className="space-y-2">
                          <Label>输入字段信息（每行一个，用逗号分隔）</Label>
                          <Textarea
                            placeholder="字段名,显示名称,类型,必填,列表显示,表单显示,可搜索&#10;name,姓名,TEXT,是,是,是,是&#10;age,年龄,INTEGER,否,是,是,否"
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            rows={6}
                          />
                          <p className="text-xs text-gray-500">
                            格式：字段名,显示名称,类型,必填(是/否),列表显示(是/否),表单显示(是/否),可搜索(是/否)
                          </p>
                          <Button onClick={parseImportText} size="sm">
                            解析
                          </Button>
                        </div>
                      )}

                      {importMethod === 'excel' && (
                        <div className="space-y-2">
                          <Label>上传 Excel 文件</Label>
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                          <Button onClick={() => fileInputRef.current?.click()} variant="outline">
                            <Upload className="w-4 h-4 mr-2" />
                            选择文件
                          </Button>
                          <p className="text-xs text-gray-500">
                            支持 .xlsx 格式，第一行为表头，从第二行开始为数据
                          </p>
                        </div>
                      )}

                      {importFields.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>已解析字段 ({importFields.length} 个)</Label>
                          </div>
                          <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="w-10">#</TableHead>
                                  <TableHead>字段名</TableHead>
                                  <TableHead>显示名称</TableHead>
                                  <TableHead>类型</TableHead>
                                  <TableHead>必填</TableHead>
                                  <TableHead className="w-10"></TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {importFields.map((field, index) => (
                                  <TableRow key={index}>
                                    <TableCell className="text-gray-500">{index + 1}</TableCell>
                                    <TableCell className="font-medium">{field.name}</TableCell>
                                    <TableCell>{field.label}</TableCell>
                                    <TableCell>
                                      <span className="text-sm">
                                        {fieldTypeConfig[field.type]?.label || field.type}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      {field.required && (
                                        <Badge variant="destructive" className="text-xs">是</Badge>
                                      )}
                                      {!field.required && (
                                        <Badge variant="outline" className="text-xs">否</Badge>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-red-500 hover:text-red-600"
                                        onClick={() => removeImportField(index)}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
                        取消
                      </Button>
                      <Button
                        onClick={handleImport}
                        disabled={importLoading || importFields.length === 0}
                      >
                        {importLoading ? '导入中...' : `导入 ${importFields.length} 个字段`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

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
              </div>
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
                    fields.map((field, index) => {
                      const ft = fieldTypeConfig[field.type]
                      const FIcon = ft?.icon || Type
                      const isDragging = draggedIndex === index
                      const isDragOver = dragOverIndex === index
                      return (
                        <TableRow
                          key={field.id}
                          draggable={!field.isSystem}
                          onDragStart={(e) => !field.isSystem && handleDragStart(e, index)}
                          onDragOver={(e) => handleDragOver(e, index)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, index)}
                          onDragEnd={handleDragEnd}
                          className={
                            (isDragging ? 'opacity-50 ' : '') +
                            (isDragOver ? 'border-t-2 border-t-primary ' : '') +
                            'cursor-move'
                          }
                        >
                          <TableCell>
                            <GripVertical className={"w-4 h-4 " + (field.isSystem ? 'text-gray-300' : 'text-gray-400 cursor-grab')} />
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
