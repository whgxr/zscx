/**
 * ReactFlow 画布组件
 *
 * 包装 @xyflow/react，管理节点/边状态，提供画布交互。
 * 支持：节点拖拽、连线创建、连线点击选择、连线删除。
 */
'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge, MarkerType,
  type Connection, type Node, type Edge, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { CustomNodes } from './CustomNodes'
import { CustomEdge } from './CustomEdge'
import { NODE_COLORS, type DesignerNodeDef, type DesignerState, type NodeType } from './designer-types'

type Props = {
  state: DesignerState
  onStateChange: (state: DesignerState) => void
  selectedNodeId: string | null
  onSelectNode: (id: string | null) => void
  selectedEdgeId: string | null
  onSelectEdge: (id: string | null) => void
  onDeleteEdge: (edgeId: string) => void
  onAddNodeAt?: (type: NodeType, position: { x: number; y: number }) => void
}

const nodeTypes = { workflowNode: CustomNodes.workflowNode }
const edgeTypes = { customEdge: CustomEdge }

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
function toRfEdges(nodes: DesignerNodeDef[], selectedEdgeId?: string | null): Edge[] {
  const edges: Edge[] = []
  const add = (source: string, target: string, handle?: string) => {
    const id = `e_${source}_${handle ?? 'any'}_${target}`
    edges.push({
      id,
      type: 'customEdge',
      source, target,
      sourceHandle: handle ?? null,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
      selected: id === selectedEdgeId,
    })
  }
  for (const n of nodes) {
    if (n.next) for (const t of n.next) add(n.id, t)
    if (n.nextTrue) for (const t of n.nextTrue) add(n.id, t, 'true')
    if (n.nextFalse) for (const t of n.nextFalse) add(n.id, t, 'false')
  }
  return edges
}

/** 从 edge ID 解析 source、handle、target */
function parseEdgeId(edgeId: string): { source: string; handle: string; target: string } | null {
  // 格式: e_{source}_{handle}_{target}
  // handle 可以是 'any', 'true', 'false'
  const parts = edgeId.split('_')
  if (parts.length < 4 || parts[0] !== 'e') return null
  // 找到 handle 位置
  // e_{source}_{handle}_{target} 其中 handle 可能是 any/true/false
  // source 可能包含下划线吗？不太可能。我们按以下方式解析：
  // parts[0] = 'e'
  // parts[1] = source
  // parts[2] = handle (any | true | false)
  // parts[3..] = target (如果 source 不含下划线的话)
  // 但实际上 source 和 target 可能包含下划线...
  // 更安全的做法：从后往前找，target 是最后一段，handle 是倒数第二段，source 是第一段
  const target = parts[parts.length - 1]
  const handle = parts[parts.length - 2]
  const source = parts.slice(1, -2).join('_')
  if (!source || !target) return null
  return { source, handle, target }
}

export function CanvasView({
  state, onStateChange, selectedNodeId, onSelectNode,
  selectedEdgeId, onSelectEdge, onDeleteEdge, onAddNodeAt,
}: Props) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(toRfNodes(state))
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(toRfEdges(state.nodes, selectedEdgeId))
  const rfRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)

  // 同步节点
  useEffect(() => {
    setRfNodes(toRfNodes(state))
  }, [state, setRfNodes])

  // 同步边（选中状态变化时重新渲染以更新高亮）
  useEffect(() => {
    setRfEdges(toRfEdges(state.nodes, selectedEdgeId))
  }, [state.nodes, selectedEdgeId, setRfEdges])

  const onInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
    rfRef.current = instance
  }, [])

  // DnD
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/designer-node-type') as NodeType
    if (!type || !onAddNodeAt) return
    const instance = rfRef.current as any
    if (!instance) return
    const toFlow = instance.screenToFlowCoordinate ?? instance.project
    if (typeof toFlow !== 'function') return
    const pos = toFlow.call(instance, { x: e.clientX, y: e.clientY })
    onAddNodeAt(type, { x: Math.max(0, (pos?.x ?? 0) - 80), y: Math.max(0, (pos?.y ?? 0) - 30) })
  }, [onAddNodeAt])

  // 节点位置/删除变化 → 同步回 state
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
    let updated = state.nodes
    let needSync = false
    for (const change of changes) {
      if (change.type === 'position' && change.position) {
        const idx = updated.findIndex(n => n.id === change.id)
        if (idx >= 0) {
          updated = updated.map(n => n.id === change.id ? { ...n, position: change.position } : n)
          needSync = true
        }
      } else if (change.type === 'remove') {
        // 键盘/画布删除节点：同步删除 DesignerState 中的节点，并清理相关连线
        const removedId = change.id
        updated = updated
          .filter(n => n.id !== removedId)
          .map(n => ({
            ...n,
            next: n.next?.filter(t => t !== removedId),
            nextTrue: n.nextTrue?.filter(t => t !== removedId),
            nextFalse: n.nextFalse?.filter(t => t !== removedId),
          }))
        needSync = true
        if (selectedNodeId === removedId) onSelectNode(null)
      }
    }
    if (needSync) onStateChange({ ...state, nodes: updated })
  }, [state, onStateChange, onNodesChange, selectedNodeId, onSelectNode])

  // 连线创建
  const onConnect = useCallback((conn: Connection) => {
    setRfEdges(eds => addEdge({
      ...conn,
      type: 'customEdge',
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 },
    }, eds))

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

  // 点击节点 → 选中节点，取消选中边
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onSelectNode(node.id)
    onSelectEdge(null)
  }, [onSelectNode, onSelectEdge])

  // 点击连线 → 选中连线，取消选中节点
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    onSelectEdge(edge.id)
    onSelectNode(null)
  }, [onSelectEdge, onSelectNode])

  // 连线被键盘 Delete/Backspace 删除时触发
  const onEdgesDelete = useCallback((edgesToDelete: Edge[]) => {
    for (const edge of edgesToDelete) {
      onDeleteEdge(edge.id)
    }
    if (selectedEdgeId && edgesToDelete.some(e => e.id === selectedEdgeId)) {
      onSelectEdge(null)
    }
  }, [onDeleteEdge, onSelectEdge, selectedEdgeId])

  // 点击画布空白处 → 取消所有选中
  const onPaneClick = useCallback(() => {
    onSelectNode(null)
    onSelectEdge(null)
  }, [onSelectNode, onSelectEdge])

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={handleNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onEdgesDelete={onEdgesDelete}
      onPaneClick={onPaneClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onInit={onInit}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      elementsSelectable
      deleteKeyCode={['Backspace', 'Delete']}
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
