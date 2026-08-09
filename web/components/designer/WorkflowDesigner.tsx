/**
 * 流程设计器主组件
 *
 * 管理设计器状态、布局、工具栏操作（保存/发布/导入/导出）。
 */
'use client'

import React, { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Save, Play, Upload, Download, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NodePalette } from './NodePalette'
import { CanvasView } from './CanvasView'
import { PropertyPanel } from './PropertyPanel'
import { createDefaultNode, stateToDefinition, definitionToState, validateState } from './designer-utils'
import type { DesignerState, DesignerNodeDef, NodeType } from './designer-types'

type Props = {
  workflowId: number
  workflowName: string
  workflowStatus: string
  initialJsonDefinition: any
  initialCanvasData: any
  initialTriggerCondition?: any
}

export function WorkflowDesigner({
  workflowId,
  workflowName,
  workflowStatus,
  initialJsonDefinition,
  initialCanvasData,
  initialTriggerCondition = null,
}: Props) {
  const router = useRouter()
  const [state, setState] = useState<DesignerState>(() => {
    const init = definitionToState(initialJsonDefinition, initialCanvasData)
    if (initialTriggerCondition !== null && initialTriggerCondition !== undefined) {
      return { ...init, globals: { ...init.globals, triggerCondition: initialTriggerCondition, name: workflowName } }
    }
    return { ...init, globals: { ...init.globals, name: workflowName } }
  })
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // ── 添加节点 ──
  const handleAddNode = useCallback((type: NodeType) => {
    const lastNode = state.nodes[state.nodes.length - 1]
    const pos = lastNode
      ? { x: lastNode.position.x + 260, y: lastNode.position.y }
      : { x: 300, y: 240 }
    const newNode = createDefaultNode(type, pos)
    setState({ ...state, nodes: [...state.nodes, newNode] })
  }, [state])

  // ── 删除节点 ──
  const handleDeleteNode = useCallback((id: string) => {
    const nodes = state.nodes
      .filter(n => n.id !== id)
      // 清理所有指向被删节点的连线
      .map(n => ({
        ...n,
        next: n.next?.filter(t => t !== id),
        nextTrue: n.nextTrue?.filter(t => t !== id),
        nextFalse: n.nextFalse?.filter(t => t !== id),
      }))
    setState({ ...state, nodes })
    if (selectedNodeId === id) setSelectedNodeId(null)
  }, [state, selectedNodeId])

  // ── 保存草稿 ──
  const handleSaveDraft = useCallback(async () => {
    setSaving(true)
    try {
      const jsonDef = stateToDefinition(state)
      const canvasData = {
        nodes: state.nodes.map(n => ({
          id: n.id, type: 'approval', position: n.position,
          data: { label: n.name, nodeType: n.type },
        })),
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }
      const res = await fetch(`/api/approval/workflows/${workflowId}/designer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonDefinition: jsonDef,
          canvasData,
          globals: {
            name: state.globals.name,
            description: state.globals.description,
            triggerCondition: state.globals.triggerCondition ?? null,
          },
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? '保存失败')
    } catch (e) {
      alert('保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }, [state, workflowId])

  // ── 发布 ──
  const handlePublish = useCallback(async () => {
    const errors = validateState(state)
    if (errors.length) {
      alert('校验未通过：\n' + errors.map(e => e.message).join('\n'))
      return
    }
    setPublishing(true)
    try {
      const jsonDef = stateToDefinition(state)
      const canvasData = {
        nodes: state.nodes.map(n => ({
          id: n.id, type: 'approval', position: n.position,
          data: { label: n.name, nodeType: n.type },
        })),
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      }
      const res = await fetch(`/api/approval/workflows/${workflowId}/designer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonDefinition: jsonDef,
          canvasData,
          globals: {
            name: state.globals.name,
            description: state.globals.description,
            triggerCondition: state.globals.triggerCondition ?? null,
          },
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error ?? '发布失败')
      alert('发布成功！')
    } catch (e) {
      alert('发布失败：' + (e as Error).message)
    } finally {
      setPublishing(false)
    }
  }, [state, workflowId])

  // ── 导出 JSON ──
  const handleExport = useCallback(() => {
    const jsonDef = stateToDefinition(state)
    const blob = new Blob([JSON.stringify(jsonDef, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `workflow-${workflowId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [state, workflowId])

  // ── 导入 JSON ──
  const handleImport = useCallback(() => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const jsonDef = JSON.parse(text)
        setState(definitionToState(jsonDef))
      } catch (e) {
        alert('导入失败：' + (e as Error).message)
      }
    }
    input.click()
  }, [])

  const statusLabel: Record<string, string> = {
    DRAFT: '草稿', PUBLISHED: '已发布', ACTIVE: '激活', INACTIVE: '已停用', ARCHIVED: '已归档',
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 顶部工具栏 */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-white shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/approval/workflows')}>
            <ChevronLeft size={16} className="mr-1" />
            返回
          </Button>
          <h1 className="text-lg font-semibold">{workflowName}</h1>
          <Badge variant={workflowStatus === 'ACTIVE' || workflowStatus === 'PUBLISHED' ? 'default' : 'secondary'}>
            {statusLabel[workflowStatus] ?? workflowStatus}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload size={14} className="mr-1" /> 导入
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download size={14} className="mr-1" /> 导出
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
            保存草稿
          </Button>
          <Button size="sm" onClick={handlePublish} disabled={publishing}>
            {publishing ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Play size={14} className="mr-1" />}
            发布
          </Button>
        </div>
      </header>

      {/* 三栏布局 */}
      <div className="flex flex-1 overflow-hidden">
        <NodePalette onAddNode={handleAddNode} />
        <div className="flex-1 relative">
          <CanvasView
            state={state}
            onStateChange={setState}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>
        <PropertyPanel
          state={state}
          selectedNodeId={selectedNodeId}
          onStateChange={setState}
          onDeleteNode={handleDeleteNode}
        />
      </div>
    </div>
  )
}
