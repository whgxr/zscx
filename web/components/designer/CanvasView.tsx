/**
 * ReactFlow 画布组件
 *
 * 包装 @xyflow/react，管理节点/边状态，提供画布交互。
 */
'use client'

import React, { useCallback, useMemo } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, MarkerType,
  type Connection, type Node, type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CustomNodes } from './CustomNodes'
import { NODE_COLORS, type DesignerNodeDef, type DesignerState } from './designer-types'

type Props = {
  state: DesignerState
  onStateChange: (state: DesignerState) => void
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
}

const nodeTypes = { workflowNode: CustomNodes.workflowNode }

/** 从 DesignerState 转换为 ReactFlow Node[] */
function toRfNodes(state: DesignerState): Node[] {
  return state.nodes.map(n => ({
    id: n.id,
    type: 'workflowNode',
    position: n.position,
    data: { ...n },
  }))
}

/** 从 DesignerState 的 next/nextTrue/nextFalse 生成 ReactFlow Edge[] */
function toRfEdges(nodes: DesignerNodeDef[]): Edge[] {
  const edges: Edge[] = []
  const add = (source: string, target: string, handle?: string) => {
    edges.push({
      id: `e_${source}_${handle ?? 'any'}_${target}`,
      source, target,
      sourceHandle: handle ?? null,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      style: { strokeWidth: 1.5 },
    })
  }
  for (const n of nodes) {
    if (n.next) for (const t of n.next) add(n.id, t)
    if (n.nextTrue) for (const t of n.nextTrue) add(n.id, t, 'true')
    if (n.nextFalse) for (const t of n.nextFalse) add(n.id, t, 'false')
  }
  return edges
}

export function CanvasView({ state, onStateChange, selectedNodeId, onSelectNode }: Props) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(toRfNodes(state))
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(toRfEdges(state.nodes))

  // 节点位置变化 → 同步回 state
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
    // 仅处理 position 变化
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const idx = state.nodes.findIndex(n => n.id === change.id)
        if (idx >= 0) {
          const updated = [...state.nodes]
          updated[idx] = { ...updated[idx], position: change.position }
          onStateChange({ ...state, nodes: updated })
        }
      }
    }
  }, [state, onStateChange, onNodesChange])

  // 连线
  const onConnect = useCallback((conn: Connection) => {
    setRfEdges(eds => addEdge({
      ...conn,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      style: { strokeWidth: 1.5 },
    }, eds))

    // 同步到 state：更新 source 节点的 next
    if (conn.source && conn.target) {
      const sourceNode = state.nodes.find(n => n.id === conn.source)
      if (!sourceNode) return

      const updated = state.nodes.map(n => {
        if (n.id !== conn.source) return n
        if (conn.sourceHandle === 'true') {
          return { ...n, nextTrue: [...(n.nextTrue ?? []), conn.target!] }
        } else if (conn.sourceHandle === 'false') {
          return { ...n, nextFalse: [...(n.nextFalse ?? []), conn.target!] }
        } else {
          return { ...n, next: [...(n.next ?? []), conn.target!] }
        }
      })
      onStateChange({ ...state, nodes: updated })
    }
  }, [state, onStateChange, setRfEdges])

  // 点击节点
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSelectNode(node.id)
  }, [onSelectNode])

  // 点击画布空白处
  const onPaneClick = useCallback(() => {
    onSelectNode(null)
  }, [onSelectNode])

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls />
      <MiniMap
        nodeColor={(n) => {
          const nd = state.nodes.find(x => x.id === n.id)
          return NODE_COLORS[nd?.type ?? ''] ?? '#6b7280'
        }}
        nodeStrokeWidth={2}
        className="!bg-white/80"
      />
    </ReactFlow>
  )
}
