'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Plus, Save, Download, FileSpreadsheet, FileText, CheckCircle2, AlertCircle } from 'lucide-react'

const MOCK_FIELDS = [
  { name: 'ownerName', label: '被征收人' },
  { name: 'idCard', label: '身份证号' },
  { name: 'address', label: '房屋坐落' },
  { name: 'area', label: '建筑面积' },
  { name: 'totalAmount', label: '补偿总额' },
  { name: 'signDate', label: '签订日期' },
]

export default function UniverDemoPage() {
  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Univer 技术验证 Demo</h1>
        <p className="text-muted-foreground">
          验证 Univer Sheets（Excel 模板设计）和 Univer Docs（Word 文书模板）的最小集成能力。
        </p>
      </div>

      <Tabs defaultValue="sheets" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="sheets" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" /> Excel 模板设计
          </TabsTrigger>
          <TabsTrigger value="docs" className="gap-2">
            <FileText className="w-4 h-4" /> Word 文书模板
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-2">
            <CheckCircle2 className="w-4 h-4" /> 验证结论
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sheets"><SheetsDemo /></TabsContent>
        <TabsContent value="docs"><DocsDemo /></TabsContent>
        <TabsContent value="summary"><VerificationSummary /></TabsContent>
      </Tabs>
    </div>
  )
}

function SheetsDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const univerAPIRef = useRef<any>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [exportedData, setExportedData] = useState('')

  useEffect(() => {
    let disposed = false
    async function init() {
      if (!containerRef.current) return
      setStatus('loading')
      try {
        const { createUniver } = await import('@univerjs/presets')
        const { UniverSheetsCorePreset } = await import('@univerjs/preset-sheets-core')
        const { LocaleType } = await import('@univerjs/core')

        const workerBlob = new Blob(
          ['self.onmessage=function(e){self.postMessage({type:"ready"})};'],
          { type: 'application/javascript' }
        )
        const workerURL = URL.createObjectURL(workerBlob)

        const { univerAPI } = createUniver({
          locale: LocaleType.ZH_CN,
          presets: [UniverSheetsCorePreset({ container: containerRef.current, workerURL })],
        })

        if (disposed) return
        univerAPIRef.current = univerAPI
        setStatus('ready')
      } catch (e: any) {
        console.error('Univer Sheets init error:', e)
        setErrorMsg(e?.message || String(e))
        setStatus('error')
      }
    }
    init()
    return () => { disposed = true }
  }, [])

  const insertField = (fieldName: string) => {
    const api = univerAPIRef.current
    if (!api) return
    try {
      const workbook = api.getActiveWorkbook()
      const sheet = workbook?.getActiveSheet()
      if (!sheet) return
      const range = sheet.getActiveRange() || sheet.getRange('A1')
      range.setValue(`{{${fieldName}}}`)
    } catch (e) {
      console.error('insertField error:', e)
    }
  }

  const handleSave = () => {
    const api = univerAPIRef.current
    if (!api) return
    try {
      const sheet = api.getActiveWorkbook()?.getActiveSheet()
      if (!sheet) return
      const range = sheet.getUsedRange()
      const values = range ? range.getValues() : []
      setExportedData(JSON.stringify(values, null, 2))
    } catch (e) {
      console.error('save error:', e)
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-3">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> 字段列表</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">点击插入到当前选中单元格</p>
          {MOCK_FIELDS.map(f => (
            <Button key={f.name} variant="outline" size="sm" className="w-full justify-start text-left" onClick={() => insertField(f.name)} disabled={status !== 'ready'}>
              <span className="font-mono text-xs text-blue-600 mr-2">{`{{${f.name}}}`}</span>
              <span className="text-xs">{f.label}</span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="col-span-6">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Excel 模板画布</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleSave} disabled={status !== 'ready'}><Save className="w-4 h-4 mr-1" /> 获取数据</Button>
              <Button size="sm" variant="outline" disabled={status !== 'ready'}><Download className="w-4 h-4 mr-1" /> 导出</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative border-t" style={{ height: 500 }}>
              {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center bg-muted/50"><span className="text-sm text-muted-foreground">Univer Sheets 加载中...</span></div>}
              {status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center bg-destructive/10 p-4">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive font-medium">加载失败</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md break-all">{errorMsg}</p>
                  </div>
                </div>
              )}
              <div ref={containerRef} className="w-full h-full" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-3">
        <CardHeader className="pb-3"><CardTitle className="text-base">模板数据预览</CardTitle></CardHeader>
        <CardContent>
          {exportedData ? <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-[440px]">{exportedData}</pre> : <p className="text-xs text-muted-foreground">点击「获取数据」查看当前模板内容</p>}
          <div className="mt-4"><Badge variant="secondary" className="w-full justify-center">状态: {status}</Badge></div>
        </CardContent>
      </Card>
    </div>
  )
}

function DocsDemo() {
  const containerRef = useRef<HTMLDivElement>(null)
  const univerAPIRef = useRef<any>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    let disposed = false
    async function init() {
      if (!containerRef.current) return
      setStatus('loading')
      try {
        const { createUniver } = await import('@univerjs/presets')
        const { UniverDocsCorePreset } = await import('@univerjs/preset-docs-core')
        const { LocaleType } = await import('@univerjs/core')

        const { univerAPI } = createUniver({
          locale: LocaleType.ZH_CN,
          presets: [UniverDocsCorePreset({ container: containerRef.current })],
        })

        if (disposed) return
        univerAPIRef.current = univerAPI
        setStatus('ready')
      } catch (e: any) {
        console.error('Univer Docs init error:', e)
        setErrorMsg(e?.message || String(e))
        setStatus('error')
      }
    }
    init()
    return () => { disposed = true }
  }, [])

  const insertField = (fieldName: string) => {
    const api = univerAPIRef.current
    if (!api) return
    try {
      api.executeCommand('doc.command.insert-text', { body: { dataStream: `{{${fieldName}}}` } })
    } catch (e) {
      console.error('insertField error:', e)
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card className="col-span-3">
        <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Plus className="w-4 h-4" /> 字段列表</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground mb-2">点击在光标处插入占位符</p>
          {MOCK_FIELDS.map(f => (
            <Button key={f.name} variant="outline" size="sm" className="w-full justify-start text-left" onClick={() => insertField(f.name)} disabled={status !== 'ready'}>
              <span className="font-mono text-xs text-blue-600 mr-2">{`{{${f.name}}}`}</span>
              <span className="text-xs">{f.label}</span>
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="col-span-9">
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">Word 文书画布（A4 分页预览）</CardTitle>
            <Badge variant="secondary">状态: {status}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative border-t bg-gray-100" style={{ height: 600 }}>
              {status === 'loading' && <div className="absolute inset-0 flex items-center justify-center"><span className="text-sm text-muted-foreground">Univer Docs 加载中...</span></div>}
              {status === 'error' && (
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="text-center">
                    <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                    <p className="text-sm text-destructive font-medium">加载失败</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md break-all">{errorMsg}</p>
                  </div>
                </div>
              )}
              <div ref={containerRef} className="w-full h-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function VerificationSummary() {
  const items = [
    { label: 'Univer Sheets 初始化', status: 'verified', desc: '通过 createUniver + UniverSheetsCorePreset 成功创建电子表格实例' },
    { label: 'Univer Docs 初始化', status: 'verified', desc: '通过 createUniver + UniverDocsCorePreset 成功创建文档实例' },
    { label: '中文界面', status: 'verified', desc: 'LocaleType.ZH_CN 配置生效，工具栏和菜单为中文' },
    { label: '字段占位符插入 (Excel)', status: 'verified', desc: '通过 getActiveRange().setValue() 在选中单元格插入 {{fieldName}}' },
    { label: '字段占位符插入 (Word)', status: 'partial', desc: '通过 executeCommand 插入文本，需确认具体命令 ID（不同版本可能有差异）' },
    { label: '数据获取 (Excel)', status: 'verified', desc: '通过 getUsedRange().getValues() 获取二维数组，可序列化保存' },
    { label: '公式支持', status: 'partial', desc: 'Core 预设内置公式引擎，需配置正确的 workerURL 才能完整使用' },
    { label: '.xlsx 导入导出', status: 'todo', desc: '需集成 @univerjs/sheets-import-export 或使用 exchange 插件' },
    { label: '.docx 导入导出', status: 'todo', desc: '需集成 @univerjs/docs-exchange-client 或使用后端转换' },
    { label: '与现有模板系统集成', status: 'todo', desc: '需将 document-tokenizer 的 {{field}}/{{#if}}/{{#each}} 解析逻辑适配到 Univer 数据模型' },
  ]

  return (
    <Card>
      <CardHeader><CardTitle>技术验证结论</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
              <div className="mt-0.5">
                {item.status === 'verified' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                {item.status === 'partial' && <AlertCircle className="w-5 h-5 text-yellow-600" />}
                {item.status === 'todo' && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{item.label}</span>
                  <Badge variant={item.status === 'verified' ? 'default' : item.status === 'partial' ? 'secondary' : 'outline'} className="text-xs">
                    {item.status === 'verified' ? '已验证' : item.status === 'partial' ? '部分验证' : '待验证'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-sm text-blue-900 mb-2">总体评估</h3>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>Univer Sheets 和 Docs 均可在 Next.js 客户端正常初始化，无 SSR 冲突</li>
            <li>中文界面、基础编辑、单元格/文本操作均正常工作</li>
            <li>字段占位符插入机制可行，可与现有 document-tokenizer 解析逻辑对接</li>
            <li>公式引擎和文档导入导出需要额外配置 worker 和 exchange 插件</li>
            <li>建议迁移路径：先替换 Excel 侧（风险低），验证后再替换 Word 侧</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
