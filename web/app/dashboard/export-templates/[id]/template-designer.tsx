"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ArrowLeft,
  Save,
  Download,
  GripVertical,
  Eye,
  Table as TableIcon,
  LayoutGrid,
  Layers,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Settings,
  Palette,
  Type,
  Columns,
} from 'lucide-react'
import { ExportType, ExportFormat, ExportTemplate, DataTable, TableField } from '@prisma/client'

interface TemplateWithTable extends ExportTemplate {
  table: DataTable & {
    fields: TableField[]
  }
}

interface TemplateDesignerProps {
  template: TemplateWithTable
}

export function TemplateDesigner({ template }: TemplateDesignerProps) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  const [type, setType] = useState<ExportType>(template.type)
  const [format, setFormat] = useState<ExportFormat>(template.format)
  const [saving, setSaving] = useState(false)
  const [config, setConfig] = useState<Record<string, any>>((template.config as Record<string, any>) || {
    fields: [],
    zebraStripes: true,
    showBorder: true,
    columnWidth: 15,
    fontSize: 11,
    cardsPerRow: 2,
    groupField: '',
    columnsPerRow: 2,
    headerBgColor: '#E5EDFE',
    headerTextColor: '#1F2937',
    zebraColor: '#F8F9FA',
    cardHeaderBgColor: '#3B82F6',
    groupHeaderColor: '#F3F4F6',
    labelBgColor: '#F9FAFB',
  })

  const table = template.table
  const allFields = table.fields
  const selectedFieldNames = config.fields?.map((f: any) => f.name) || []
  const selectedFields = selectedFieldNames
    .map((name: string) => allFields.find(f => f.name === name))
    .filter(Boolean)

  useEffect(() => {
    if (!config.groupField && selectedFields.length > 0) {
      setConfig((prev: Record<string, any>) => ({ ...prev, groupField: selectedFields[0]?.name || '' }))
    }
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/export-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          config: {
            ...config,
            fields: selectedFieldNames.map((name: string) => {
              const field = allFields.find(f => f.name === name)
              return { name, label: field?.label || name }
            }),
          },
        }),
      })

      if (res.ok) {
        alert('保存成功')
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.message || '保存失败')
      }
    } catch (err) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const addField = (fieldName: string) => {
    setConfig((prev: Record<string, any>) => ({
      ...prev,
      fields: [...(prev.fields || []), { name: fieldName }],
    }))
  }

  const removeField = (fieldName: string) => {
    setConfig((prev: Record<string, any>) => ({
      ...prev,
      fields: prev.fields.filter((f: any) => f.name !== fieldName),
    }))
  }

  const moveField = (index: number, direction: 'up' | 'down') => {
    setConfig((prev: Record<string, any>) => {
      const fields = [...prev.fields]
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= fields.length) return prev
      const [removed] = fields.splice(index, 1)
      fields.splice(newIndex, 0, removed)
      return { ...prev, fields }
    })
  }

  const availableFields = allFields.filter(f => !selectedFieldNames.includes(f.name))

  // 预览数据
  const previewData = [
    { id: 1, status: '已审核', createdAt: '2026-07-01 10:30:00' },
    { id: 2, status: '已提交', createdAt: '2026-07-02 14:20:00' },
    { id: 3, status: '草稿', createdAt: '2026-07-03 09:15:00' },
  ].map(item => ({
    ...item,
    data: Object.fromEntries(
      selectedFields.map((f: any) => [f.name, f.label + '示例值'])
    ),
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/dashboard/export-templates')}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">模板设计器</h1>
            <p className="text-gray-500 mt-1">
              {table.label} · {format === 'EXCEL' ? 'Excel' : 'PDF'} · 
              {type === 'STANDARD' && '标准列表'}
              {type === 'CARD' && '卡片式'}
              {type === 'GROUPED' && '分组汇总'}
              {type === 'FORM' && '表单式'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/export-templates')}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存模板'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* 左侧：设置面板 */}
        <div className="col-span-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">模板名称</Label>
                <Input
                  id="templateName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="templateDesc">描述</Label>
                <Input
                  id="templateDesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>格式</Label>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={format === 'EXCEL' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setFormat('EXCEL')}
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={format === 'PDF' ? 'default' : 'outline'}
                      className="flex-1"
                      onClick={() => setFormat('PDF')}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>类型</Label>
                  <Select value={type} onValueChange={(v: ExportType) => setType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">标准列表</SelectItem>
                      <SelectItem value="CARD">卡片式</SelectItem>
                      <SelectItem value="GROUPED">分组汇总</SelectItem>
                      <SelectItem value="FORM">表单式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="w-4 h-4" />
                样式设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="basic">基础</TabsTrigger>
                  <TabsTrigger value="advanced">高级</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">斑马纹</Label>
                      <p className="text-xs text-gray-500">交替行背景色</p>
                    </div>
                    <Switch
                      checked={config.zebraStripes}
                      onCheckedChange={(checked) => setConfig((prev: Record<string, any>) => ({ ...prev, zebraStripes: checked }))}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-sm">显示边框</Label>
                      <p className="text-xs text-gray-500">显示表格边框线</p>
                    </div>
                    <Switch
                      checked={config.showBorder}
                      onCheckedChange={(checked) => setConfig((prev: Record<string, any>) => ({ ...prev, showBorder: checked }))}
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Type className="w-4 h-4 text-gray-400" />
                      字体大小
                    </Label>
                    <Select
                      value={config.fontSize?.toString() || '11'}
                      onValueChange={(v) => setConfig((prev: Record<string, any>) => ({ ...prev, fontSize: parseInt(v) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="9">9px</SelectItem>
                        <SelectItem value="10">10px</SelectItem>
                        <SelectItem value="11">11px</SelectItem>
                        <SelectItem value="12">12px</SelectItem>
                        <SelectItem value="14">14px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {type === 'CARD' && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm">
                          <LayoutGrid className="w-4 h-4 text-gray-400" />
                          每行卡片数
                        </Label>
                        <Select
                          value={config.cardsPerRow?.toString() || '2'}
                          onValueChange={(v) => setConfig((prev: Record<string, any>) => ({ ...prev, cardsPerRow: parseInt(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1列</SelectItem>
                            <SelectItem value="2">2列</SelectItem>
                            <SelectItem value="3">3列</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {type === 'FORM' && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm">
                          <Columns className="w-4 h-4 text-gray-400" />
                          每行列数
                        </Label>
                        <Select
                          value={config.columnsPerRow?.toString() || '2'}
                          onValueChange={(v) => setConfig((prev: Record<string, any>) => ({ ...prev, columnsPerRow: parseInt(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1列</SelectItem>
                            <SelectItem value="2">2列</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                  {type === 'GROUPED' && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm">
                          <Layers className="w-4 h-4 text-gray-400" />
                          分组字段
                        </Label>
                        <Select
                          value={config.groupField || ''}
                          onValueChange={(v) => setConfig((prev: Record<string, any>) => ({ ...prev, groupField: v }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择分组字段" />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedFields.map((f: any) => (
                              <SelectItem key={f.name} value={f.name}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Palette className="w-4 h-4 text-gray-400" />
                      表头背景色
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={config.headerBgColor || '#E5EDFE'}
                        onChange={(e) => setConfig((prev: Record<string, any>) => ({ ...prev, headerBgColor: e.target.value }))}
                        className="w-12 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={config.headerBgColor || '#E5EDFE'}
                        onChange={(e) => setConfig((prev: Record<string, any>) => ({ ...prev, headerBgColor: e.target.value }))}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <Palette className="w-4 h-4 text-gray-400" />
                      斑马纹颜色
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={config.zebraColor || '#F8F9FA'}
                        onChange={(e) => setConfig((prev: Record<string, any>) => ({ ...prev, zebraColor: e.target.value }))}
                        className="w-12 h-10 p-1 cursor-pointer"
                      />
                      <Input
                        value={config.zebraColor || '#F8F9FA'}
                        onChange={(e) => setConfig((prev: Record<string, any>) => ({ ...prev, zebraColor: e.target.value }))}
                        className="flex-1 font-mono text-sm"
                      />
                    </div>
                  </div>
                  {(type === 'CARD' || type === 'FORM') && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm">
                          <Palette className="w-4 h-4 text-gray-400" />
                          卡片标题背景色
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            value={config.cardHeaderBgColor || '#3B82F6'}
                            onChange={(e) => setConfig((prev: Record<string, any>) => ({ ...prev, cardHeaderBgColor: e.target.value }))}
                            className="w-12 h-10 p-1 cursor-pointer"
                          />
                          <Input
                            value={config.cardHeaderBgColor || '#3B82F6'}
                            onChange={(e) => setConfig((prev: Record<string, any>) => ({ ...prev, cardHeaderBgColor: e.target.value }))}
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {type === 'STANDARD' && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2 text-sm">
                          <Columns className="w-4 h-4 text-gray-400" />
                          列宽
                        </Label>
                        <Select
                          value={config.columnWidth?.toString() || '15'}
                          onValueChange={(v) => setConfig((prev: Record<string, any>) => ({ ...prev, columnWidth: parseInt(v) }))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">紧凑</SelectItem>
                            <SelectItem value="15">标准</SelectItem>
                            <SelectItem value="20">宽松</SelectItem>
                            <SelectItem value="25">超宽</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TableIcon className="w-4 h-4" />
                字段设置（{selectedFields.length}个）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-sm mb-2 block">已选字段（拖拽排序）</Label>
                <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                  {selectedFields.length > 0 ? (
                    selectedFields.map((field: any, index: number) => (
                      <div
                        key={field.name}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 bg-white"
                      >
                        <GripVertical className="w-4 h-4 text-gray-300 cursor-grab" />
                        <span className="flex-1 text-sm">{field.label}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={index === 0}
                            onClick={() => moveField(index, 'up')}
                          >
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={index === selectedFields.length - 1}
                            onClick={() => moveField(index, 'down')}
                          >
                            <ArrowDown className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:text-red-600"
                            onClick={() => removeField(field.name)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-8 text-center text-gray-400 text-sm">
                      暂未选择字段
                    </div>
                  )}
                </div>
              </div>

              {availableFields.length > 0 && (
                <div>
                  <Label className="text-sm mb-2 block">可用字段</Label>
                  <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                    {availableFields.map((field: any) => (
                      <div
                        key={field.name}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                      >
                        <Plus className="w-4 h-4 text-gray-300" />
                        <span className="flex-1 text-sm text-gray-600">{field.label}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => addField(field.name)}
                        >
                          添加
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfig((prev: Record<string, any>) => ({
                    ...prev,
                    fields: allFields.map(f => ({ name: f.name, label: f.label })),
                  }))}
                >
                  全选
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setConfig((prev: Record<string, any>) => ({ ...prev, fields: [] }))}
                >
                  清空
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：预览面板 */}
        <div className="col-span-8">
          <Card className="h-full flex flex-col">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="w-4 h-4" />
                    实时预览
                  </CardTitle>
                  <CardDescription>
                    左侧修改配置，右侧实时查看效果
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {format === 'EXCEL' ? 'Excel 预览' : 'PDF 预览'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {/* 标准列表预览 */}
              {type === 'STANDARD' && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm" style={{ fontSize: `${config.fontSize || 11}px` }}>
                    <thead>
                      <tr style={{ backgroundColor: config.headerBgColor || '#E5EDFE' }}>
                        <th className="px-3 py-2 text-left font-medium">ID</th>
                        {selectedFields.map((f: any) => (
                          <th key={f.name} className="px-3 py-2 text-left font-medium">
                            {f.label}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left font-medium">状态</th>
                        <th className="px-3 py-2 text-left font-medium">创建时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((record, idx) => (
                        <tr
                          key={record.id}
                          style={{
                            backgroundColor: config.zebraStripes && idx % 2 === 1
                              ? config.zebraColor || '#F8F9FA'
                              : 'white',
                            border: config.showBorder ? '1px solid #E5E7EB' : 'none',
                          }}
                        >
                          <td className="px-3 py-2 border-t">{record.id}</td>
                          {selectedFields.map((f: any) => (
                            <td key={f.name} className="px-3 py-2 border-t">
                              {(record as any).data[f.name]}
                            </td>
                          ))}
                          <td className="px-3 py-2 border-t">{record.status}</td>
                          <td className="px-3 py-2 border-t">{record.createdAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 卡片式预览 */}
              {type === 'CARD' && (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${config.cardsPerRow || 2}, minmax(0, 1fr))`,
                  }}
                >
                  {previewData.map(record => (
                    <div
                      key={record.id}
                      className={`border rounded-lg overflow-hidden ${config.showBorder ? '' : 'shadow-sm'}`}
                    >
                      <div
                        className="px-4 py-3 text-white font-medium"
                        style={{ backgroundColor: config.cardHeaderBgColor || '#3B82F6' }}
                      >
                        记录 #{record.id} - {record.status}
                      </div>
                      <div className="p-4 space-y-2">
                        {selectedFields.map((f: any) => (
                          <div key={f.name} className="flex gap-2 text-sm">
                            <span className="text-gray-500 w-20 shrink-0">{f.label}:</span>
                            <span className="flex-1">{(record as any).data[f.name]}</span>
                          </div>
                        ))}
                        <div className="flex gap-2 text-sm">
                          <span className="text-gray-500 w-20 shrink-0">创建时间:</span>
                          <span className="flex-1">{record.createdAt}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 分组汇总预览 */}
              {type === 'GROUPED' && (
                <div className="space-y-4">
                  {['分组A', '分组B'].map((group, groupIdx) => (
                    <div key={group}>
                      <div
                        className="px-4 py-2 font-medium rounded-t-lg"
                        style={{ backgroundColor: config.groupHeaderColor || '#F3F4F6' }}
                      >
                        {config.groupField ? (
                          <span>{allFields.find(f => f.name === config.groupField)?.label || '分组'}: {group} ({previewData.length}条)</span>
                        ) : (
                          <span>请选择分组字段</span>
                        )}
                      </div>
                      <div className="border rounded-b-lg overflow-hidden">
                        <table className="w-full text-sm" style={{ fontSize: `${config.fontSize || 11}px` }}>
                          <thead>
                            <tr style={{ backgroundColor: config.headerBgColor || '#E5EDFE' }}>
                              <th className="px-3 py-2 text-left font-medium">ID</th>
                              {selectedFields.filter((f: any) => f.name !== config.groupField).map((f: any) => (
                                <th key={f.name} className="px-3 py-2 text-left font-medium">
                                  {f.label}
                                </th>
                              ))}
                              <th className="px-3 py-2 text-left font-medium">状态</th>
                              <th className="px-3 py-2 text-left font-medium">创建时间</th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewData.slice(0, 2).map((record, idx) => (
                              <tr
                                key={record.id}
                                style={{
                                  backgroundColor: config.zebraStripes && idx % 2 === 1
                                    ? config.zebraColor || '#F8F9FA'
                                    : 'white',
                                }}
                              >
                                <td className="px-3 py-2 border-t">{record.id}</td>
                                {selectedFields.filter((f: any) => f.name !== config.groupField).map((f: any) => (
                                  <td key={f.name} className="px-3 py-2 border-t">
                                    {(record as any).data[f.name]}
                                  </td>
                                ))}
                                <td className="px-3 py-2 border-t">{record.status}</td>
                                <td className="px-3 py-2 border-t">{record.createdAt}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 表单式预览 */}
              {type === 'FORM' && (
                <div className="space-y-6">
                  {previewData.slice(0, 1).map(record => (
                    <div key={record.id} className="border rounded-lg overflow-hidden">
                      <div className="p-4 border-b">
                        <h3 className="text-lg font-bold">{table.label}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          记录编号: #{record.id} · 状态: {record.status}
                        </p>
                      </div>
                      <div
                        className="p-4 grid gap-4"
                        style={{
                          gridTemplateColumns: `repeat(${config.columnsPerRow || 2}, minmax(0, 1fr))`,
                        }}
                      >
                        {selectedFields.map((f: any) => (
                          <div key={f.name} className="space-y-1">
                            <div
                              className="px-3 py-1.5 text-sm font-medium rounded-t"
                              style={{ backgroundColor: config.labelBgColor || '#F9FAFB' }}
                            >
                              {f.label}
                            </div>
                            <div className={`px-3 py-2 text-sm border rounded-b ${config.showBorder ? '' : 'border-t-0'}`}>
                              {(record as any).data[f.name]}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 border-t text-sm text-gray-500">
                        创建时间: {record.createdAt}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedFields.length === 0 && (
                <div className="flex items-center justify-center h-64 text-gray-400">
                  <div className="text-center">
                    <TableIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>请从左侧添加字段以查看预览</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
