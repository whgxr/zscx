"use client"

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Save,
  Upload,
  Eye,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Type,
  Plus,
  Trash2,
  Database,
  ChevronDown,
  Merge,
  Unlink,
  Grid3x3,
  Minus,
  AlignJustify,
  ChevronUp,
  ArrowUpDown,
  Calculator,
  FileSpreadsheet,
  Settings,
} from 'lucide-react'
import { ExportTemplate, DataTable, TableField } from '@prisma/client'
import { ExcelEditor, ExcelEditorHandle, EditorConfig, CellStyle } from '@/components/excel-editor/ExcelEditor'

interface TemplateWithTable extends ExportTemplate {
  table: DataTable & {
    fields: TableField[]
  }
}

interface PageSetup {
  paperSize: 'A4' | 'A3' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  headerMargin: number
  footerMargin: number
}

export function EmbeddedTemplateDesigner({ template }: { template: TemplateWithTable }) {
  const router = useRouter()
  const editorRef = useRef<ExcelEditorHandle>(null)
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || '')
  const [saving, setSaving] = useState(false)
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null)
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false)
  const [pageSetupDialogOpen, setPageSetupDialogOpen] = useState(false)
  const [formulaInput, setFormulaInput] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const table = template.table
  const allFields = table.fields

  const [pageSetup, setPageSetup] = useState<PageSetup>({
    paperSize: 'A4',
    orientation: 'portrait',
    marginTop: 2.54,
    marginBottom: 2.54,
    marginLeft: 2.54,
    marginRight: 2.54,
    headerMargin: 1.27,
    footerMargin: 1.27,
  })

  const initialData = (): EditorConfig | undefined => {
    const cfg = template.config as any
    if (cfg && cfg.grid) {
      return {
        rows: cfg.rows || 30,
        cols: cfg.cols || 15,
        data: cfg.grid || [],
        styles: cfg.styles || [],
        colWidths: cfg.colWidths || [],
        rowHeights: cfg.rowHeights || [],
        mergedCells: cfg.mergedCells || [],
        formulas: cfg.formulas || [],
      }
    }
    return undefined
  }

  const countFields = useCallback(() => {
    if (!editorRef.current) return 0
    const data = editorRef.current.getData().data
    let count = 0
    data.forEach(row => {
      row.forEach(cell => {
        if (typeof cell === 'string' && cell.includes('{{')) {
          count++
        }
      })
    })
    return count
  }, [])

  const handleDataChange = useCallback((config: EditorConfig) => {
    const selected = editorRef.current?.getSelectedCell()
    if (selected) {
      setActiveCell(selected)
    }
  }, [])

  const toggleBold = useCallback(() => {
    if (!activeCell || !editorRef.current) return
    editorRef.current.setCellStyle(activeCell.row, activeCell.col, {
      bold: !(editorRef.current.getData().styles[activeCell.row]?.[activeCell.col]?.bold),
    })
  }, [activeCell])

  const toggleItalic = useCallback(() => {
    if (!activeCell || !editorRef.current) return
    editorRef.current.setCellStyle(activeCell.row, activeCell.col, {
      italic: !(editorRef.current.getData().styles[activeCell.row]?.[activeCell.col]?.italic),
    })
  }, [activeCell])

  const toggleUnderline = useCallback(() => {
    if (!activeCell || !editorRef.current) return
    editorRef.current.setCellStyle(activeCell.row, activeCell.col, {
      underline: !(editorRef.current.getData().styles[activeCell.row]?.[activeCell.col]?.underline),
    })
  }, [activeCell])

  const setAlign = useCallback((align: 'left' | 'center' | 'right') => {
    if (!activeCell || !editorRef.current) return
    editorRef.current.setCellStyle(activeCell.row, activeCell.col, { align })
  }, [activeCell])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (!editorRef.current) {
        alert('编辑器未就绪')
        return
      }
      const data = editorRef.current.getData()
      const config = {
        ...data,
        pageSetup,
      }

      const res = await fetch(`/api/export-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          config,
        }),
      })

      if (res.ok) {
        alert('保存成功')
        router.push('/dashboard/export-templates')
      } else {
        const result = await res.json()
        alert(result.message || '保存失败')
      }
    } catch (error) {
      alert('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (editorRef.current) {
      const success = await editorRef.current.importFromExcel(file)
      if (success) {
        alert('导入成功')
      } else {
        alert('导入失败')
      }
    }
    setImportDialogOpen(false)
    e.target.value = ''
  }

  const handlePreview = async () => {
    if (!editorRef.current) return
    const blob = await editorRef.current.exportToExcel()
    if (blob) {
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      URL.revokeObjectURL(url)
    }
  }

  const handleInsertFormula = () => {
    if (!activeCell || !editorRef.current || !formulaInput) return
    editorRef.current.setCellStyle(activeCell.row, activeCell.col, {})
    const newData = editorRef.current.getData()
    newData.data[activeCell.row][activeCell.col] = formulaInput
    setFormulaDialogOpen(false)
    setFormulaInput('')
  }

  const fieldCount = countFields()

  return (
    <div className="space-y-4">
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
            <h1 className="text-xl font-bold text-gray-900">Excel模板设计器</h1>
            <p className="text-gray-500 text-sm">
              {table.label} · {fieldCount}个字段绑定
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                导入Excel样表
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>导入Excel样表</DialogTitle>
                <DialogDescription>
                  上传一个Excel文件作为模板基础，之后可以编辑并绑定数据库字段。
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  ref={fileInputRef}
                  onChange={handleImportExcel}
                  className="w-full"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={handlePreview}>
                <Eye className="w-4 h-4 mr-2" />
                预览效果
              </Button>
            </DialogTrigger>
          </Dialog>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? '保存中...' : '保存模板'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">模板信息</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          <div className="flex-1">
            <Label className="text-xs">模板名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="输入模板名称" />
          </div>
          <div className="flex-1">
            <Label className="text-xs">模板描述</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="输入模板描述" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">编辑工具栏</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8" onClick={toggleBold}>
                <Bold className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={toggleItalic}>
                <Italic className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={toggleUnderline}>
                <Underline className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8" onClick={() => setAlign('left')}>
                <AlignLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setAlign('center')}>
                <AlignCenter className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => setAlign('right')}>
                <AlignRight className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8" onClick={() => editorRef.current?.mergeSelected()}>
                <Merge className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => editorRef.current?.unmergeSelected()}>
                <Unlink className="w-4 h-4" />
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-8" onClick={() => editorRef.current?.addRow()}>
                <Plus className="w-4 h-4 mr-1" />
                行
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => editorRef.current?.addCol()}>
                <Plus className="w-4 h-4 mr-1" />
                列
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => editorRef.current?.deleteRow()}>
                <Minus className="w-4 h-4 mr-1" />
                行
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={() => editorRef.current?.deleteCol()}>
                <Minus className="w-4 h-4 mr-1" />
                列
              </Button>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <Dialog open={formulaDialogOpen} onOpenChange={setFormulaDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Calculator className="w-4 h-4 mr-1" />
                  公式
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>插入公式</DialogTitle>
                  <DialogDescription>
                    在当前单元格插入 Excel 公式，以 = 开头，如 =SUM(A1:B1)
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                  <Label>公式内容</Label>
                  <Input
                    value={formulaInput}
                    onChange={(e) => setFormulaInput(e.target.value)}
                    placeholder="如: =SUM(A1:B1)"
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">取消</Button>
                  </DialogClose>
                  <Button onClick={handleInsertFormula} disabled={!activeCell || !formulaInput}>
                    插入
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={pageSetupDialogOpen} onOpenChange={setPageSetupDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Settings className="w-4 h-4 mr-1" />
                  页面布局
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>页面布局设置</DialogTitle>
                  <DialogDescription>
                    设置打印纸张大小、方向和边距
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>纸张大小</Label>
                      <select
                        value={pageSetup.paperSize}
                        onChange={(e) => setPageSetup({ ...pageSetup, paperSize: e.target.value as any })}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                        <option value="Letter">Letter</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label>方向</Label>
                      <select
                        value={pageSetup.orientation}
                        onChange={(e) => setPageSetup({ ...pageSetup, orientation: e.target.value as any })}
                        className="w-full border rounded px-3 py-2"
                      >
                        <option value="portrait">纵向</option>
                        <option value="landscape">横向</option>
                      </select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">取消</Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button>确定</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Separator orientation="vertical" className="h-6" />
            <Dialog open={fieldDialogOpen} onOpenChange={setFieldDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Database className="w-4 h-4 mr-1" />
                  插入字段
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[70vh]">
                <DialogHeader>
                  <DialogTitle>插入字段</DialogTitle>
                  <DialogDescription>
                    选择要插入到当前单元格的数据库字段
                  </DialogDescription>
                </DialogHeader>
                <div className="py-4 overflow-auto">
                  <div className="grid grid-cols-2 gap-2">
                    {allFields.map((field) => (
                      <Button
                        key={field.name}
                        variant="outline"
                        className="justify-start text-left"
                        onClick={() => {
                          if (editorRef.current) {
                            editorRef.current.insertField(field.name, field.label)
                          }
                          setFieldDialogOpen(false)
                        }}
                      >
                        <span className="truncate">{field.label}</span>
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {field.type}
                        </Badge>
                      </Button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">取消</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">嵌入式 Excel 编辑器</CardTitle>
          <p className="text-xs text-gray-500">支持拖拽调整行列大小、合并单元格、公式计算、撤销/重做等功能</p>
        </CardHeader>
        <CardContent>
          <ExcelEditor
            ref={editorRef}
            initialData={initialData()}
            fields={allFields}
            onDataChange={handleDataChange}
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default EmbeddedTemplateDesigner
