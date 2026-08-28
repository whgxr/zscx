'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, PanelRight, Braces } from 'lucide-react'

export interface TemplateField {
  name: string
  label: string
}

/**
 * ONLYOFFICE 模板设计器（Word/Excel 通用，按 kind 分支）
 * 流程：模板无文件→调 office-file 初始化；调 office-config 取 JWT 配置；
 *       注入 DS api.js → DocsAPI.DocEditor 打开真实 docx/xlsx；
 *       「字段插入」由业务系统托管的 DS 插件提供（config 经 plugins.options 注入字段列表），
 *       在编辑器界面点插件面板里的字段 → Asc.plugin.executeMethod("PasteText") 插入到光标。
 *       保存由 DS forcesave 回调(office-callback)自动落 MinIO 并更新模板 key。
 *
 * 注意：不使用 docEditor.createConnector()——那是 ONLYOFFICE 开发版(付费)专属能力，
 *       社区版取不到 connector。故改为官方插件机制（社区版免费可用）。
 */
export function OfficeTemplateEditor({
  templateId,
  kind,
  title,
}: {
  templateId: number
  kind: 'word' | 'cell'
  title: string
}) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('准备中...')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const initRef = useRef(false)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    ;(async () => {
      try {
        // 1. 确保模板有文件
        setStatus('检查模板文件...')
        let res = await fetch(`/api/export-templates/${templateId}/office-file?kind=${kind}`, { method: 'POST', cache: 'no-store' })
        const fileJson = await res.json()
        if (!res.ok) throw new Error(fileJson.message || '初始化文件失败')

        // 2. 获取编辑器配置
        setStatus('获取编辑器配置...')
        res = await fetch(`/api/export-templates/${templateId}/office-config?kind=${kind}`, { cache: 'no-store' })
        const cfg = await res.json()
        if (!res.ok) throw new Error(cfg.message || '获取配置失败')
        const ds = cfg.ds
        delete cfg.ds

        // 3. 注入 DS api.js
        setStatus('加载 ONLYOFFICE 引擎...')
        const existing = document.querySelector('#ds-api')
        if (!existing) {
          const s = document.createElement('script')
          s.id = 'ds-api'
          s.src = ds + '/web-apps/apps/api/documents/api.js'
          document.head.appendChild(s)
          await new Promise((r) => (s.onload = r))
        }
        if (!(window as any).DocsAPI) throw new Error('DocsAPI 未定义')

        // 4. 打开编辑器（客户端补 events；就绪标记由 DS 事件触发）
        const el = containerRef.current
        // 防 React 重挂重复创建：容器已存在编辑器则直接标记就绪
        if (el && el.querySelector('#office-editor')) {
          setReady(true)
          setStatus('编辑器已就绪')
          return
        }
        if (el) el.innerHTML = ''
        const holder = document.createElement('div')
        holder.id = 'office-editor'
        holder.style.width = '100%'
        holder.style.height = '100%'
        el!.appendChild(holder)
        cfg.events = {
          ...(cfg.events || {}),
          onDocumentReady: () => {
            setReady(true)
            setStatus('编辑器已就绪')
          },
          onError: (e: any) => {
            // DS onError 回调可能是对象/字符串，统一提取可读信息
            const msg = typeof e === 'string' ? e : (e?.message || JSON.stringify(e) || String(e))
            setError(msg)
          },
        }
        editorRef.current = (window as any).DocsAPI.DocEditor('office-editor', cfg)
        setStatus('编辑器加载中...')
      } catch (e: any) {
        console.error('[office-editor] error', e)
        setError(e?.message || String(e))
      }
    })()
  }, [templateId, kind])

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border-b text-sm">
        <button
          type="button"
          onClick={() => router.push('/dashboard/export-templates')}
          className="inline-flex items-center gap-1 text-blue-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> 返回
        </button>
        <span className="font-semibold">
          {kind === 'cell' ? 'Excel' : 'Word'} 模板设计器（ONLYOFFICE）
        </span>
        <span className="text-xs text-muted-foreground truncate max-w-[30vw]">{title}</span>
        <span className="mx-auto" />
        {status === '编辑器已就绪' ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> {status}
          </span>
        ) : error ? (
          <span className="text-xs text-red-600">{String(error)}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {status}
          </span>
        )}
        <button
          type="button"
          onClick={() => { location.reload() }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gray-800"
          title="重新加载编辑器"
        >
          <RefreshCw className="w-3.5 h-3.5" /> 刷新
        </button>
      </div>
      {error && (
        <div className="px-4 py-2 text-xs bg-red-50 text-red-700 border-b">{String(error)}</div>
      )}
      <div className="flex flex-1 min-h-0">
        {/* 使用说明：字段插入由编辑器内的「字段插入」插件面板提供 */}
        <div className="w-60 shrink-0 border-r bg-slate-50 flex flex-col">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5 border-b bg-white">
            <Braces className="w-3.5 h-3.5" /> 插入字段
          </div>
          <div className="p-3 text-[11px] leading-relaxed text-slate-600 space-y-2">
            <p>将光标定位到文档中需要插入表单字段的位置。</p>
            <p className="inline-flex items-center gap-1.5">
              <PanelRight className="w-3.5 h-3.5 text-blue-500" />
              打开编辑器右上角的
              <b className="text-blue-600">「字段插入」</b>
              插件面板
            </p>
            <p>点击面板中的字段即可插入到光标处（示例：<code className="font-mono text-blue-500">{"{{house_address}}"}</code>）。</p>
            <p>保存后占位符将按表单数据自动替换。</p>
          </div>
        </div>
        {/* 编辑器区 */}
        <div ref={containerRef} className="flex-1 bg-white min-w-0" />
      </div>
    </div>
  )
}

export default OfficeTemplateEditor