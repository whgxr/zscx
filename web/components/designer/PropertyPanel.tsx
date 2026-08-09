/**
 * 属性面板组件
 *
 * 右侧面板：全局设置 / 选中节点配置 的 Tab 容器。
 */
'use client'

import React from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import type { DesignerNodeDef, DesignerGlobals, DesignerState } from './designer-types'
import { NODE_COLORS } from './designer-types'
import { GlobalSettings } from './GlobalSettings'
import { ApproverNodeConfig } from './node-configs/ApproverNodeConfig'
import { ConditionNodeConfig } from './node-configs/ConditionNodeConfig'
import { CCNodeConfig } from './node-configs/CCNodeConfig'
import { ParallelNodeConfig } from './node-configs/ParallelNodeConfig'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Props = {
  state: DesignerState
  selectedNodeId: string | null
  onStateChange: (state: DesignerState) => void
  onDeleteNode: (id: string) => void
}

export function PropertyPanel({ state, selectedNodeId, onStateChange, onDeleteNode }: Props) {
  const selectedNode = selectedNodeId
    ? state.nodes.find(n => n.id === selectedNodeId)
    : null

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

  return (
    <div className="w-72 border-l bg-white p-4 overflow-y-auto shrink-0">
      <Tabs defaultValue={selectedNode ? 'node' : 'global'}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="node" disabled={!selectedNode}>节点属性</TabsTrigger>
          <TabsTrigger value="global">全局设置</TabsTrigger>
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
          ) : (
            <div className="text-center text-sm text-gray-400 mt-8">
              点击画布中的节点以编辑属性
            </div>
          )}
        </TabsContent>

        <TabsContent value="global" className="mt-4">
          <GlobalSettings
            globals={state.globals}
            onChange={g => onStateChange({ ...state, globals: g })}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
