'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

/**
 * Univer Docs(Word 文书) 编辑器 —— 官方 presets 路径。
 * 结构镜像 univer-sheets-editor.tsx：动态加载 @univerjs/presets + @univerjs/preset-docs-core，
 * 用 createUniver + UniverDocsCorePreset 挂载；initialDocData 为 IDocumentData 快照。
 * 通过 ref.getSnapshot() 取回当前 IDocumentData 用于保存。
 */

export interface UniverDocsEditorHandle {
  /** 获取当前 IDocumentData 快照；失败返回 null */
  getSnapshot: () => any
}

interface EditorField {
  name: string
  label: string
}

interface UniverDocsEditorProps {
  /** 初始 IDocumentData（无需时 undefined，Univer 建空文档） */
  initialDocData?: any
  /** 字段库（点击在光标处插入 {{name}}） */
  fields?: EditorField[]
  height?: number
}

interface UniverDocInstanceRef {
  univer: any
  api: any
}

const UniverDocsEditor = forwardRef<UniverDocsEditorHandle, UniverDocsEditorProps>(
  function UniverDocsEditor({ initialDocData, fields = [], height = 640 }, ref) {
    const containerRef = useRef<HTMLDivElement>(null)
    const instanceRef = useRef<UniverDocInstanceRef | null>(null)
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [errMsg, setErrMsg] = useState('')

    useImperativeHandle(ref, () => ({
      getSnapshot: () => {
        try {
          const api = instanceRef.current?.api
          if (!api) return null
          return api.getActiveDocument?.()?.getSnapshot?.() ?? null
        } catch (e) {
          console.error('[univer-docs] getSnapshot error', e)
          return null
        }
      },
    }))

    useEffect(() => {
      let disposed = false
      const el = containerRef.current
      if (!el) return

      async function init() {
        setStatus('loading')
        try {
          const mods = await importUniverDocs()
          if (disposed) return
          const inst = mountUniverDoc(el, mods, initialDocData)
          if (disposed) { try { inst.univer.dispose?.() } catch { /* noop */ } return }
          instanceRef.current = inst
          setStatus('ready')
        } catch (e: any) {
          console.error('[univer-docs] init error', e)
          if (disposed) return
          setErrMsg(e?.message || String(e))
          setStatus('error')
        }
      }

      init()
      return () => {
        disposed = true
        const inst = instanceRef.current
        instanceRef.current = null
        if (inst) { try { inst.univer.dispose?.() } catch { /* noop */ } }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialDocData])

    function insertField(field: EditorField) {
      const api = instanceRef.current?.api
      if (!api) return
      try {
        api.getActiveDocument?.()?.insertText?.(`{{${field.name}}}`)
      } catch (e) {
        console.error('[univer-docs] insertField error', e)
      }
    }

    return (
      <div>
        <div className="relative border rounded-md overflow-hidden bg-white" style={{ height }}>
          {status === 'loading' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-muted/60 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> 正在加载 Univer Word 引擎...
            </div>
          )}
          {status === 'error' && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-destructive/5 p-6">
              <div className="text-center max-w-md">
                <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-destructive font-medium">Univer Word 加载失败</p>
                <p className="text-xs text-muted-foreground mt-1 break-all">{errMsg}</p>
              </div>
            </div>
          )}
          <div
            ref={containerRef}
            className="w-full h-full"
            style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}
          />
        </div>
        {fields.length > 0 && (
          <div className="mt-2">
            <div className="text-xs text-muted-foreground mb-1">字段（点击插入到光标处）</div>
            <div className="flex flex-wrap gap-1">
              {fields.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => insertField(f)}
                  disabled={status !== 'ready'}
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-blue-50 disabled:opacity-40 border-slate-200"
                >
                  <span className="font-mono text-[10px] text-blue-600">{'{{' + f.name + '}}'}</span>
                  <span>{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
)

export default UniverDocsEditor

/** 动态加载 docs presets 依赖 */
async function importUniverDocs() {
  const mods = await import('@univerjs/presets' as any)
  const preset = await import('@univerjs/preset-docs-core' as any)
  const zhCN = (await import('@univerjs/preset-docs-core/locales/zh-CN' as any))?.default
  await import('@univerjs/preset-docs-core/lib/index.css' as any)
  return {
    createUniver: mods.createUniver,
    LocaleType: mods.LocaleType,
    mergeLocales: mods.mergeLocales,
    UniverDocsCorePreset: preset.UniverDocsCorePreset,
    zhCN,
  }
}

/** 挂载 Univer Docs（createUniver + UniverDocsCorePreset） */
function mountUniverDoc(el: HTMLElement, mods: any, initialDocData?: any): UniverDocInstanceRef {
  const { createUniver, LocaleType, mergeLocales, UniverDocsCorePreset, zhCN } = mods
  const zhItem = zhCN && typeof zhCN === 'object' && 'zhCN' in zhCN ? zhCN.zhCN : zhCN

  const created = createUniver({
    locale: LocaleType.ZH_CN,
    locales: mergeLocales
      ? { [LocaleType.ZH_CN]: mergeLocales(zhItem) }
      : { [LocaleType.ZH_CN]: zhItem || {} },
    presets: [UniverDocsCorePreset({ container: el })],
  })

  const docData = initialDocData && initialDocData.body ? initialDocData : emptyDocData()
  created.univerAPI.createUniverDoc(docData)

  return { univer: created.univer, api: created.univerAPI }
}

/** 空文档 IDocumentData */
function emptyDocData(): any {
  return {
    id: 'doc-empty-' + Math.random().toString(36).slice(2, 8),
    body: {
      dataStream: '\r\n',
    },
    settings: {},
  }
}