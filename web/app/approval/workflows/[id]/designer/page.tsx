/**
 * 流程设计器页面（Shell + 数据加载）
 *
 * 路由：/approval/workflows/[id]/designer
 * 数据加载后渲染 WorkflowDesigner 组件。
 */
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { WorkflowDesigner } from '@/components/designer/WorkflowDesigner'
import { useTabs, resolveKeyFromHref } from '@/components/layout/tabs-context'

export default function DesignerPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const { prepareLabel } = useTabs()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<{
    name: string
    status: string
    jsonDefinition: any
    canvasData: any
    triggerCondition: any
    specialAction: any
  } | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/approval/workflows/${id}/designer`)
        const json = await res.json()
        if (!json.ok) throw new Error(json.error ?? '加载失败')
        const name = json.data.workflowName ?? json.data.name ?? '未命名流程'
        prepareLabel(resolveKeyFromHref(window.location.href), `流程设计：${name}`)
        setData({
          name,
          status: json.data.status ?? 'DRAFT',
          jsonDefinition: json.data.jsonDefinition ?? null,
          canvasData: json.data.canvasData ?? null,
          triggerCondition: json.data.workflow?.triggerCondition ?? null,
          specialAction: json.data.workflow?.specialAction ?? null,
        })
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    }
    if (id) load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={32} className="animate-spin text-blue-500" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        加载失败：{error ?? '未知错误'}
      </div>
    )
  }

  return (
    <WorkflowDesigner
      workflowId={Number(id)}
      workflowName={data.name}
      workflowStatus={data.status}
      initialJsonDefinition={data.jsonDefinition}
      initialCanvasData={data.canvasData}
      initialTriggerCondition={data.triggerCondition}
      initialSpecialAction={data.specialAction}
    />
  )
}
