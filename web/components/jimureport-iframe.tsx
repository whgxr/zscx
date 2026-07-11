"use client"

import { useState, useRef, useCallback } from "react"

interface JimuReportIframeProps {
  /** 报表设计器页面路径，如 /jmreport/designer */
  pagePath: string
  /** 附加查询参数 */
  queryParams?: Record<string, string>
  /** iframe 高度 */
  height?: string
  /** 加载完成回调 */
  onLoad?: () => void
  /** 报表保存后回调（通过 postMessage 通信） */
  onReportSaved?: (reportId: string) => void
  /** 是否显示加载状态 */
  showLoading?: boolean
}

/**
 * JimuReport 积木报表 iframe 嵌入组件
 * 支持：报表设计器、表单设计器、打印设计器、大屏设计器
 */
export default function JimuReportIframe({
  pagePath,
  queryParams = {},
  height = "calc(100vh - 200px)",
  onLoad,
  onReportSaved,
  showLoading = true,
}: JimuReportIframeProps) {
  const [loading, setLoading] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // 构建完整 URL
  const baseUrl = process.env.NEXT_PUBLIC_JIMUREPORT_URL || ""
  const queryString = new URLSearchParams(queryParams).toString()
  const fullUrl = baseUrl
    ? `${baseUrl}${pagePath}${queryString ? `?${queryString}` : ""}`
    : `${pagePath}${queryString ? `?${queryString}` : ""}`

  const handleLoad = useCallback(() => {
    setLoading(false)
    onLoad?.()
  }, [onLoad])

  // 监听来自 JimuReport 的 postMessage
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // JimuReport 保存报表后发送的消息
      if (event.data?.type === "jimureport:saved" && event.data?.reportId) {
        onReportSaved?.(event.data.reportId)
      }
    },
    [onReportSaved]
  )

  return (
    <div className="relative w-full" style={{ height }}>
      {showLoading && loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-500">积木报表加载中...</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={fullUrl}
        className="w-full h-full border-0"
        onLoad={handleLoad}
        title="JimuReport"
        allow="clipboard-write"
      />
    </div>
  )
}