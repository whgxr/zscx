/**
 * 属性面板组件
 *
 * 右侧面板：全局设置 / 选中节点配置 的 Tab 容器。
 * 支持边（连线）选择和删除。
 */
'use client'

import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Trash2, ArrowRight, Trash } from 'lucide-react'
import type { DesignerNodeDef, DesignerGlobals, DesignerState } from './designer-types'
import { NODE_COLORS } from './designer-types'
import { GlobalSettings } from './GlobalSettings'
import { SpecialActionSettings } from './SpecialActionSettings'
import { ApproverNodeConfig } from './node-configs/ApproverNodeConfig'
import { ConditionNodeConfig } from './node-configs/ConditionNodeConfig'
import { CCNodeConfig } from './node-configs/CCNodeConfig'
import { ParallelNodeConfig } from './node-configs/ParallelNodeConfig'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  state: DesignerState
  selectedNodeId: string | null
  selectedEdgeId: string | null
  onStateChange: (state: DesignerState) => void
  onDeleteNode: (id: string) => void
  onDeleteEdge: (edgeId: string) => void
}

/** 从 edge ID 解析信息 */
function parseEdgeId(edgeId: string): { source: string; target: string; handle: string } | null {
  const parts = edgeId.split('_')
  if (parts.length < 4 || parts[0] !== 'e') return null
  const target = parts[parts.length - 1]
  const handle = parts[parts.length - 2]
  const source = parts.slice(1, -2).join('_')
  return { source, target, handle }
}

const HANDLE_LABEL: Record<string, string> = {
  any: '默认路径',
  true: '条件成立',
  false: '条件不成立',
}

export function PropertyPanel({
  state, selectedNodeId, selectedEdgeId,
  onStateChange, onDeleteNode, onDeleteEdge,
}: Props) {
  const selectedNode = selectedNodeId
    ? state.nodes.find(n => n.id === selectedNodeId)
    : null

  // 选中边的信息
  const edgeInfo = selectedEdgeId ? parseEdgeId(selectedEdgeId) : null
  const edgeSourceNode = edgeInfo ? state.nodes.find(n => n.id === edgeInfo.source) : null
  const edgeTargetNode = edgeInfo ? state.nodes.find(n => n.id === edgeInfo.target) : null

  const updateNode = (id: string, updates: Partial<DesignerNodeDef>) => {
    const nodes = state.nodes.map(n => n.id === id ? { ...n, ...updates } : n)
    onStateChange({ ...state, nodes })
  }

  const renderNodeConfig = () => {
    if (!selectedNode) return null
    const t = selectedNode.type

    if (t === 'START' || t === 'END') {
      return (
        <div className="space-y-4">
          <div>
            <Label className="text-xs text-gray-500">节点名称</Label>
            <Input
              value={selectedNode.name}
              onChange={e => updateNode(selectedNode.id, { name: e.target.value })}
            />
          </div>
        </div>
      )
    }

    if (t.startsWith('APPROVER_')) {
      return <ApproverNodeConfig node={selectedNode} onChange={u => updateNode(selectedNode.id, u)} />
    }
    if (t === 'CONDITION_BRANCH') {
      return <ConditionNodeConfig node={selectedNode} onChange={u => updateNode(selectedNode.id, u)} />
    }
    if (t === 'CC') {
      return <CCNodeConfig node={selectedNode} onChange={u => updateNode(selectedNode.id, u)} />
    }
    if (t === 'PARALLEL') {
      return <ParallelNodeConfig node={selectedNode} onChange={u => updateNode(selectedNode.id, u)} />
    }
    return null
  }

  const hasSelection = !!(selectedNode || selectedEdgeId)

  return (
    <div className="w-72 border-l bg-white p-4 overflow-y-auto shrink-0">
      {/* 边选中提示条 */}
      {edgeInfo && (
        <div className="mb-3 p-3 rounded-md border border-blue-200 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <ArrowRight size={14} />
              选中连线
            </div>
            <button
              onClick={() => onDeleteEdge(selectedEdgeId!)}
              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-0.5 rounded transition-colors"
            >
              <Trash size={12} />
              删除
            </button>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="truncate max-w-[80px]" title={edgeSourceNode?.name ?? edgeInfo.source}>
              {edgeSourceNode?.name ?? edgeInfo.source}
            </span>
            <ArrowRight size={12} className="shrink-0 text-gray-400" />
            <span className="truncate max-w-[80px]" title={edgeTargetNode?.name ?? edgeInfo.target}>
              {edgeTargetNode?.name ?? edgeInfo.target}
            </span>
          </div>
          <div className="mt-1.5 text-[10px] text-gray-400">
            路径: {HANDLE_LABEL[edgeInfo.handle] ?? edgeInfo.handle}
          </div>
        </div>
      )}

      <Tabs defaultValue={hasSelection ? 'node' : 'global'}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="node" disabled={!selectedNode && !selectedEdgeId} className="!px-1 !text-[11px]">
            {selectedNode ? '节点属性' : '连线信息'}
          </TabsTrigger>
          <TabsTrigger value="global" className="!px-1 !text-[11px]">全局</TabsTrigger>
          <TabsTrigger value="special" className="!px-1 !text-[11px]">专项动作</TabsTrigger>
        </TabsList>

        <TabsContent value="node" className="mt-4">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: NODE_COLORS[selectedNode.type] ?? '#6b7280' }}
                />
                <span className="text-[10px] text-gray-400 font-mono">{selectedNode.id.slice(0, 8)}</span>
              </div>

              <Separator />

              {renderNodeConfig()}

              <Separator />

              {selectedNode.type !== 'START' && selectedNode.type !== 'END' && (
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => onDeleteNode(selectedNode.id)}
                >
                  <Trash2 size={14} className="mr-2" />
                  删除节点
                </Button>
              )}
            </div>
          ) : selectedEdgeId ? (
            <div className="space-y-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-medium text-gray-700 mb-2">连线详情</div>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 w-14">起点:</span>
                    <span className="truncate">{edgeSourceNode?.name ?? edgeInfo?.source ?? '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 w-14">终点:</span>
                    <span className="truncate">{edgeTargetNode?.name ?? edgeInfo?.target ?? '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-400 w-14">类型:</span>
                    <span>{HANDLE_LABEL[edgeInfo?.handle ?? ''] ?? '默认路径'}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="w-full"
                onClick={() => onDeleteEdge(selectedEdgeId)}
              >
                <Trash size={14} className="mr-2" />
                删除连线
              </Button>
              <div className="text-center text-xs text-gray-400">
                提示：也可以选中连线后按 Delete / Backspace 键删除
              </div>
            </div>
          ) : (
            <div className="text-center text-sm text-gray-400 mt-8">
              点击画布中的节点或连线以编辑属性
            </div>
          )}
        </TabsContent>

        <TabsContent value="global" className="mt-4">
          <GlobalSettings
            globals={state.globals}
            onChange={g => onStateChange({ ...state, globals: g })}
          />
        </TabsContent>

        <TabsContent value="special" className="mt-4">
          <SpecialActionSettings
            value={state.globals.specialAction}
            onChange={v => onStateChange({ ...state, globals: { ...state.globals, specialAction: v } })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
