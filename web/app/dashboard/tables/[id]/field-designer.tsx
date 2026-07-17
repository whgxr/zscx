"use client"

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import FormExcelDesigner from '@/components/form-excel-designer'
import { FormExcelConfig } from '@/types/form-excel-config'
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
  Search,
  Upload,
  Download,
  ChevronDown,
  ChevronUp,
  Settings,
  Table2,
  Layers,
} from 'lucide-react'
import { FieldType, DataTable, TableField, Role } from '@prisma/client'
import * as ExcelJS from 'exceljs'

interface FieldDesignerProps {
  table: DataTable & {
    fields: TableField[]
    formLayoutConfig?: any
  }
  userRole: { name: string } | null
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
  DETAIL_TABLE: { label: '明细表单', icon: Layers },
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
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFieldIds, setSelectedFieldIds] = useState<number[]>([])
  const [batchDisplayDialogOpen, setBatchDisplayDialogOpen] = useState(false)
  const [batchDisplayForm, setBatchDisplayForm] = useState({
    showInList: true,
    showInForm: true,
    showInSearch: true,
    updateList: false,
    updateForm: false,
    updateSearch: false,
  })
  const [batchDisplayLoading, setBatchDisplayLoading] = useState(false)

  const toggleSelectAllFields = () => {
    const filteredFields = searchQuery
      ? fields.filter(f => 
          f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          f.label.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : fields
    const nonSystemFields = filteredFields.filter(f => !f.isSystem)
    if (selectedFieldIds.length === nonSystemFields.length) {
      setSelectedFieldIds([])
    } else {
      setSelectedFieldIds(nonSystemFields.map(f => f.id))
    }
  }

  const toggleSelectField = (id: number) => {
    setSelectedFieldIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await fetch('/api/tables?includeDetail=true')
        if (res.ok) {
          const data = await res.json()
          setAvailableTables((data.tables || []).map((t: any) => ({ id: t.id, name: t.name, label: t.label, isDetailTable: t.isDetailTable })))
        }
      } catch (err) {
        // 静默失败
      }
    }
    fetchTables()
  }, [])

  const handleBatchDelete = async () => {
    if (selectedFieldIds.length === 0) return
    if (!confirm(`确定要删除选中的 ${selectedFieldIds.length} 个字段吗？`)) return

    try {
      setLoading(true)
      const newFields = fields.filter(f => !selectedFieldIds.includes(f.id))
      setFields(newFields)
      await fetch(`/api/tables/${table.id}/fields`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedFieldIds }),
      })
      setSelectedFieldIds([])
    } catch (error) {
      console.error('Batch delete fields error:', error)
      alert('批量删除失败')
    } finally {
      setLoading(false)
    }
  }

  const handleBatchUpdateDisplay = async () => {
    if (selectedFieldIds.length === 0) return

    const updateData: any = { fieldIds: selectedFieldIds }
    if (batchDisplayForm.updateList) updateData.showInList = batchDisplayForm.showInList
    if (batchDisplayForm.updateForm) updateData.showInForm = batchDisplayForm.showInForm
    if (batchDisplayForm.updateSearch) updateData.showInSearch = batchDisplayForm.showInSearch

    if (!batchDisplayForm.updateList && !batchDisplayForm.updateForm && !batchDisplayForm.updateSearch) {
      alert('请至少勾选一项要修改的显示设置')
      return
    }

    setBatchDisplayLoading(true)
    try {
      const res = await fetch(`/api/tables/${table.id}/fields/batch-update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      })

      if (res.ok) {
        const data = await res.json()
        // 本地更新字段状态
        setFields(prev => prev.map(f => {
          if (!selectedFieldIds.includes(f.id)) return f
          return {
            ...f,
            ...(batchDisplayForm.updateList && { showInList: batchDisplayForm.showInList }),
            ...(batchDisplayForm.updateForm && { showInForm: batchDisplayForm.showInForm }),
            ...(batchDisplayForm.updateSearch && { showInSearch: batchDisplayForm.showInSearch }),
          }
        }))
        setBatchDisplayDialogOpen(false)
        setBatchDisplayForm({
          showInList: true,
          showInForm: true,
          showInSearch: true,
          updateList: false,
          updateForm: false,
          updateSearch: false,
        })
        alert(`成功更新 ${data.count} 个字段的显示设置`)
      } else {
        const data = await res.json()
        alert(data.message || '更新失败')
      }
    } catch (err) {
      alert('更新失败')
    } finally {
      setBatchDisplayLoading(false)
    }
  }

  const openBatchDisplayDialog = () => {
    setBatchDisplayForm({
      showInList: true,
      showInForm: true,
      showInSearch: true,
      updateList: false,
      updateForm: false,
      updateSearch: false,
    })
    setBatchDisplayDialogOpen(true)
  }
  const [formData, setFormData] = useState({
    name: '',
    label: '',
    type: 'TEXT' as FieldType,
    required: false,
    placeholder: '',
    showInList: true,
    showInForm: true,
    showInSearch: true,
    options: [] as { label: string; value: string }[],
  })
  const [showOptions, setShowOptions] = useState(false)
  const [newOptionLabel, setNewOptionLabel] = useState('')
  const [newOptionValue, setNewOptionValue] = useState('')
  const [activeTab, setActiveTab] = useState('fields')
  const [availableTables, setAvailableTables] = useState<Array<{ id: number; name: string; label: string; isDetailTable?: boolean }>>([])
  const [detailConfig, setDetailConfig] = useState<{ detailTableId?: number; detailTableName?: string; minRows?: number; maxRows?: number }>({})
  const [createDetailTableDialogOpen, setCreateDetailTableDialogOpen] = useState(false)
  const [newDetailTableName, setNewDetailTableName] = useState('')
  const [newDetailTableLabel, setNewDetailTableLabel] = useState('')

  const hasOptions = (type: FieldType) => {
    return ['SELECT', 'MULTISELECT', 'CHECKBOX', 'RADIO'].includes(type)
  }

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
      options: [],
    })
    setDetailConfig({})
    setShowOptions(false)
    setNewOptionLabel('')
    setNewOptionValue('')
    setDialogOpen(true)
  }

  const handleCreateDetailTable = async () => {
    if (!newDetailTableName.trim() || !newDetailTableLabel.trim()) {
      alert('请填写表名和显示名称')
      return
    }
    const nameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/
    if (!nameRegex.test(newDetailTableName.trim())) {
      alert('表名只能包含字母、数字和下划线，且以字母开头')
      return
    }

    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newDetailTableName.trim(),
          label: newDetailTableLabel.trim(),
          description: `${table.label}的明细子表`,
          isDetailTable: true,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const newTable = data.table
        setAvailableTables(prev => [
          ...prev,
          { id: newTable.id, name: newTable.name, label: newTable.label, isDetailTable: true }
        ])
        setDetailConfig({
          ...detailConfig,
          detailTableId: newTable.id,
          detailTableName: newTable.name,
        })
        setCreateDetailTableDialogOpen(false)
        setNewDetailTableName('')
        setNewDetailTableLabel('')
        alert(`子表「${newTable.label}」创建成功，已自动关联到明细子表列表`)
      } else {
        const data = await res.json()
        alert(data.message || '创建子表失败')
      }
    } catch (err) {
      alert('创建子表失败')
    }
  }

  const openEditDialog = (field: TableField) => {
    setEditingField(field)
    const fieldOptions = (field.options as { label: string; value: string }[]) || []
    setFormData({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
      placeholder: field.placeholder || '',
      showInList: field.showInList,
      showInForm: field.showInForm,
      showInSearch: field.showInSearch,
      options: fieldOptions,
    })
    setShowOptions(hasOptions(field.type) && fieldOptions.length > 0)
    setNewOptionLabel('')
    setNewOptionValue('')
    if (field.type === 'DETAIL_TABLE' && field.config) {
      const cfg = field.config as any
      setDetailConfig({
        detailTableId: cfg.detailTableId,
        detailTableName: cfg.detailTableName,
        minRows: cfg.minRows,
        maxRows: cfg.maxRows,
      })
    } else {
      setDetailConfig({})
    }
    setDialogOpen(true)
  }

  const addOption = () => {
    if (!newOptionLabel.trim()) return
    const value = newOptionValue.trim() || newOptionLabel.trim()
    if (formData.options.some(o => o.value === value)) {
      alert('选项值已存在')
      return
    }
    setFormData({
      ...formData,
      options: [...formData.options, { label: newOptionLabel.trim(), value }],
    })
    setNewOptionLabel('')
    setNewOptionValue('')
  }

  const removeOption = (index: number) => {
    setFormData({
      ...formData,
      options: formData.options.filter((_, i) => i !== index),
    })
  }

  const moveOption = (index: number, direction: 'up' | 'down') => {
    const newOptions = [...formData.options]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newOptions.length) return
    ;[newOptions[index], newOptions[targetIndex]] = [newOptions[targetIndex], newOptions[index]]
    setFormData({ ...formData, options: newOptions })
  }

  const updateOption = (index: number, field: 'label' | 'value', value: string) => {
    const newOptions = [...formData.options]
    newOptions[index] = { ...newOptions[index], [field]: value }
    setFormData({ ...formData, options: newOptions })
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.label) return
    if (formData.type === 'DETAIL_TABLE' && !detailConfig.detailTableId) {
      alert('请选择明细子表')
      return
    }

    setLoading(true)
    try {
      const url = editingField
        ? `/api/tables/${table.id}/fields/${editingField.id}`
        : `/api/tables/${table.id}/fields`
      const method = editingField ? 'PUT' : 'POST'

      const submitData: any = { ...formData }
      if (!hasOptions(formData.type)) {
        submitData.options = []
      }
      if (formData.type === 'DETAIL_TABLE') {
        submitData.config = {
          detailTableId: detailConfig.detailTableId,
          detailTableName: detailConfig.detailTableName,
          minRows: detailConfig.minRows ?? 0,
          maxRows: detailConfig.maxRows ?? 100,
        }
      } else {
        submitData.config = null
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      })

      if (res.ok) {
        const data = await res.json()
        if (editingField) {
          setFields(prev => prev.map(f => f.id === editingField.id ? data.field : f))
        } else {
          setFields(prev => [...prev, data.field])
        }
        setDialogOpen(false)
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
        setFields(prev => prev.filter(f => f.id !== fieldId))
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
      { type: 'DETAIL_TABLE', label: '明细表单', description: '明细表单（一对多），可录入多条子记录' },
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

  const handleSaveFormLayout = async (config: FormExcelConfig) => {
    try {
      const res = await fetch(`/api/tables/${table.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formLayoutConfig: config }),
      })

      if (res.ok) {
        alert('表单布局保存成功')
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    }
  }

  return (
    <div className="space-y-6" tabIndex={0} onKeyDown={(e) => {
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        openCreateDialog()
      }
    }}>
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">字段设计 - {table.label}</h1>
          <p className="text-gray-500 mt-1">项目名: {table.name}</p>
        </div>
        {userRole?.name === 'ADMIN' && (
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

      <div className="flex gap-2 mb-4">
        <Button onClick={() => setActiveTab('fields')} variant={activeTab === 'fields' ? 'default' : 'outline'}>字段设计</Button>
        <Button onClick={() => setActiveTab('layout')} variant={activeTab === 'layout' ? 'default' : 'outline'}>表单布局</Button>
      </div>

      {activeTab === 'fields' && (
        <div className="mt-6">
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
                                            title="移除"
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
                        <Button onClick={openCreateDialog} title="快捷键: Ctrl+N">
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
                          {hasOptions(formData.type) && (
                            <div className="col-span-2 space-y-3 pt-2 border-t">
                              <div
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => setShowOptions(!showOptions)}
                              >
                                <div className="flex items-center gap-2">
                                  <Settings className="w-4 h-4 text-gray-500" />
                                  <span className="font-medium text-sm">选项管理</span>
                                  <Badge variant="secondary" className="text-xs">
                                    {formData.options.length} 个选项
                                  </Badge>
                                </div>
                                {showOptions ? (
                                  <ChevronUp className="w-4 h-4 text-gray-500" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-gray-500" />
                                )}
                              </div>
                              {showOptions && (
                                <div className="space-y-3">
                                  <div className="flex gap-2">
                                    <Input
                                      placeholder="选项显示名称"
                                      value={newOptionLabel}
                                      onChange={(e) => setNewOptionLabel(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && addOption()}
                                      className="flex-1"
                                    />
                                    <Input
                                      placeholder="选项值（留空则同名称）"
                                      value={newOptionValue}
                                      onChange={(e) => setNewOptionValue(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && addOption()}
                                      className="flex-1"
                                    />
                                    <Button onClick={addOption} size="sm">
                                      <Plus className="w-4 h-4 mr-1" />
                                      添加
                                    </Button>
                                  </div>
                                  {formData.options.length > 0 && (
                                    <div className="border rounded-md overflow-hidden">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-12">序号</TableHead>
                                            <TableHead>显示名称</TableHead>
                                            <TableHead>选项值</TableHead>
                                            <TableHead className="w-28 text-right">操作</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {formData.options.map((opt, index) => (
                                            <TableRow key={index}>
                                              <TableCell className="text-gray-500 text-sm">{index + 1}</TableCell>
                                              <TableCell>
                                                <Input
                                                  value={opt.label}
                                                  onChange={(e) => updateOption(index, 'label', e.target.value)}
                                                  className="h-8 text-sm"
                                                />
                                              </TableCell>
                                              <TableCell>
                                                <Input
                                                  value={opt.value}
                                                  onChange={(e) => updateOption(index, 'value', e.target.value)}
                                                  className="h-8 text-sm"
                                                />
                                              </TableCell>
                                              <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    onClick={() => moveOption(index, 'up')}
                                                    disabled={index === 0}
                                                  >
                                                    <ChevronUp className="w-4 h-4" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0"
                                                    onClick={() => moveOption(index, 'down')}
                                                    disabled={index === formData.options.length - 1}
                                                  >
                                                    <ChevronDown className="w-4 h-4" />
                                                  </Button>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                                                    onClick={() => removeOption(index)}
                                                  >
                                                    <Trash2 className="w-4 h-4" />
                                                  </Button>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}
                                  {formData.options.length === 0 && (
                                    <div className="text-center py-6 text-gray-400 text-sm border border-dashed rounded-md">
                                      暂无选项，请在上方添加
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {formData.type === 'DETAIL_TABLE' && (
                            <div className="col-span-2 space-y-3 pt-2 border-t">
                              <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-gray-500" />
                                <span className="font-medium text-sm">明细表单配置</span>
                                <Badge variant="secondary" className="text-xs">一对多</Badge>
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="detail-table-select">关联子表 *</Label>
                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    <Select
                                      value={detailConfig.detailTableId ? String(detailConfig.detailTableId) : ''}
                                      onValueChange={(v) => {
                                        const tbl = availableTables.find(t => t.id === Number(v))
                                        setDetailConfig({
                                          ...detailConfig,
                                          detailTableId: Number(v),
                                          detailTableName: tbl?.name,
                                        })
                                      }}
                                    >
                                      <SelectTrigger id="detail-table-select">
                                        <SelectValue placeholder="请选择明细子表" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {availableTables
                                          .filter(t => t.id !== table.id && t.isDetailTable)
                                          .map(t => (
                                            <SelectItem key={t.id} value={String(t.id)}>
                                              {t.label} ({t.name})
                                            </SelectItem>
                                          ))}
                                        {availableTables.filter(t => t.id !== table.id && t.isDetailTable).length === 0 && (
                                          <div className="px-3 py-2 text-sm text-gray-500">
                                            还没有明细子表，请点击右侧"新建子表"创建
                                          </div>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCreateDetailTableDialogOpen(true)}
                                  >
                                    <Plus className="w-3 h-3 mr-1" />
                                    新建子表
                                  </Button>
                                </div>
                                <p className="text-xs text-gray-500">
                                  记录中可添加多条子表记录（如：家庭成员、明细物品等）
                                </p>
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label htmlFor="min-rows">最少行数</Label>
                                  <Input
                                    id="min-rows"
                                    type="number"
                                    min={0}
                                    value={detailConfig.minRows ?? 0}
                                    onChange={(e) => setDetailConfig({
                                      ...detailConfig,
                                      minRows: parseInt(e.target.value) || 0,
                                    })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="max-rows">最多行数</Label>
                                  <Input
                                    id="max-rows"
                                    type="number"
                                    min={1}
                                    value={detailConfig.maxRows ?? 100}
                                    onChange={(e) => setDetailConfig({
                                      ...detailConfig,
                                      maxRows: parseInt(e.target.value) || 100,
                                    })}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
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

                    <Dialog open={createDetailTableDialogOpen} onOpenChange={setCreateDetailTableDialogOpen}>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>新建明细子表</DialogTitle>
                          <DialogDescription>
                            创建一个新的数据表作为明细子表，创建后会自动关联到当前字段
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="new-detail-table-name">表名 *</Label>
                            <Input
                              id="new-detail-table-name"
                              placeholder="如：family_member"
                              value={newDetailTableName}
                              onChange={(e) => setNewDetailTableName(e.target.value)}
                            />
                            <p className="text-xs text-gray-500">只能包含字母、数字和下划线，且以字母开头</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="new-detail-table-label">显示名称 *</Label>
                            <Input
                              id="new-detail-table-label"
                              placeholder="如：家庭成员"
                              value={newDetailTableLabel}
                              onChange={(e) => setNewDetailTableLabel(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setCreateDetailTableDialogOpen(false)}>
                            取消
                          </Button>
                          <Button onClick={handleCreateDetailTable}>
                            创建子表
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedFieldIds.length > 0 && (
                    <div className="flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-lg mb-4">
                      <span className="text-sm text-gray-600">已选择 {selectedFieldIds.length} 个字段</span>
                      <Button variant="outline" size="sm" onClick={openBatchDisplayDialog}>
                        <Settings className="w-4 h-4 mr-2" />
                        批量修改显示设置
                      </Button>
                      <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        批量删除
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setSelectedFieldIds([])}>
                        取消选择
                      </Button>
                    </div>
                  )}
                  <div className="mb-4 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="搜索字段名称或显示名称..."
                      className="pl-9"
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <input
                            type="checkbox"
                            checked={selectedFieldIds.length > 0 && 
                              fields.filter(f => !f.isSystem).length === selectedFieldIds.length}
                            onChange={toggleSelectAllFields}
                            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                        </TableHead>
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
                      {(() => {
                        const filteredFields = searchQuery
                          ? fields.filter(f => 
                              f.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              f.label.toLowerCase().includes(searchQuery.toLowerCase())
                            )
                          : fields
                        return filteredFields.length > 0 ? (
                          filteredFields.map((field, index) => {
                            const originalIndex = fields.indexOf(field)
                            const ft = fieldTypeConfig[field.type]
                            const FIcon = ft?.icon || Type
                            const isDragging = draggedIndex === originalIndex
                            const isDragOver = dragOverIndex === originalIndex
                            return (
                            <TableRow
                              key={field.id}
                              draggable={!field.isSystem}
                              onDragStart={(e) => !field.isSystem && handleDragStart(e, originalIndex)}
                              onDragOver={(e) => handleDragOver(e, originalIndex)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, originalIndex)}
                              onDragEnd={handleDragEnd}
                              className={
                                (isDragging ? 'opacity-50 ' : '') +
                                (isDragOver ? 'border-t-2 border-t-primary ' : '') +
                                'cursor-move'
                              }
                            >
                              <TableCell>
                                {!field.isSystem && (
                                  <input
                                    type="checkbox"
                                    checked={selectedFieldIds.includes(field.id)}
                                    onChange={() => toggleSelectField(field.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                <GripVertical className={"w-4 h-4 " + (field.isSystem ? 'text-gray-300' : 'text-gray-400 cursor-grab')} />
                              </TableCell>
                              <TableCell className="font-medium">{field.name}</TableCell>
                              <TableCell>{field.label}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5">
                                  <FIcon className="w-4 h-4 text-gray-400" />
                                  <span className="text-sm">{ft?.label}</span>
                                  {hasOptions(field.type) && (
                                    <Badge variant="outline" className="text-xs ml-1">
                                      {((field.options as { label: string; value: string }[]) || []).length} 选项
                                    </Badge>
                                  )}
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
                                    title="编辑字段"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-500 hover:text-red-600"
                                    onClick={() => handleDelete(field.id)}
                                    disabled={field.isSystem}
                                    title="删除字段"
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
                      )
                      })()}
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
                    {Object.entries(fieldTypeConfig).map(([key, config]) => {
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
      )}

      {activeTab === 'layout' && (
        <div className="mt-6">
          <FormExcelDesigner
            tableId={table.id}
            fields={fields}
            initialConfig={table.formLayoutConfig as FormExcelConfig | null}
            onSave={handleSaveFormLayout}
          />
        </div>
      )}

      {/* 批量修改显示设置对话框 */}
      <Dialog open={batchDisplayDialogOpen} onOpenChange={setBatchDisplayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量修改显示设置</DialogTitle>
            <DialogDescription>
              对选中的 {selectedFieldIds.length} 个字段批量修改显示设置，勾选要修改的项并设置目标值。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={batchDisplayForm.updateList}
                  onChange={(e) => setBatchDisplayForm({ ...batchDisplayForm, updateList: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div>
                  <p className="font-medium text-sm">列表显示</p>
                  <p className="text-xs text-gray-500">是否在数据列表中显示</p>
                </div>
              </div>
              <Switch
                checked={batchDisplayForm.showInList}
                onCheckedChange={(v) => setBatchDisplayForm({ ...batchDisplayForm, showInList: v })}
                disabled={!batchDisplayForm.updateList}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={batchDisplayForm.updateForm}
                  onChange={(e) => setBatchDisplayForm({ ...batchDisplayForm, updateForm: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div>
                  <p className="font-medium text-sm">表单显示</p>
                  <p className="text-xs text-gray-500">是否在录入表单中显示</p>
                </div>
              </div>
              <Switch
                checked={batchDisplayForm.showInForm}
                onCheckedChange={(v) => setBatchDisplayForm({ ...batchDisplayForm, showInForm: v })}
                disabled={!batchDisplayForm.updateForm}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={batchDisplayForm.updateSearch}
                  onChange={(e) => setBatchDisplayForm({ ...batchDisplayForm, updateSearch: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div>
                  <p className="font-medium text-sm">可搜索</p>
                  <p className="text-xs text-gray-500">是否可以作为搜索条件</p>
                </div>
              </div>
              <Switch
                checked={batchDisplayForm.showInSearch}
                onCheckedChange={(v) => setBatchDisplayForm({ ...batchDisplayForm, showInSearch: v })}
                disabled={!batchDisplayForm.updateSearch}
              />
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">
                勾选左侧复选框表示要修改该项设置，右侧开关控制目标值。未勾选的项将保持原值不变。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDisplayDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchUpdateDisplay} disabled={batchDisplayLoading}>
              {batchDisplayLoading ? '保存中...' : `应用到 ${selectedFieldIds.length} 个字段`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
