"use client"

import { useState, useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
} from '@xyflow/react'
import {
  User,
  Users,
  FileText,
  GitBranch,
  Play,
  Square,
  Check,
  X,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
interface DesignerNode {
  id: number
  nodeType: string
  nodeName: string
  nodeOrder: number
  label: string
  userId: number | null
  roleId: number | null
  fieldName: string | null
  conditionField: string | null
  conditionOp: string | null
  conditionValue: string | null
  nextNodeTrue: number | null
  nextNodeFalse: number | null
  canView: boolean
  canEdit: boolean
  canApprove: boolean
  canTransfer: boolean
}

interface ApprovalFlowDesignerProps {
  nodes: DesignerNode[]
  onSave: (nodes: DesignerNode[]) => void
}

const nodeTypes: Record<string, React.ComponentType<any>> = {
  start: ({ data }: { data: { label: string } }) => (
    <div className="w-24 h-14 bg-green-500 text-white rounded-lg flex flex-col items-center justify-center shadow-lg">
      <Play className="w-5 h-5 mb-1" />
      <span className="text-xs font-medium">{data.label}</span>
      <Handle type="source" position={Position.Right} className="bg-green-600" />
    </div>
  ),
  end: ({ data }: { data: { label: string; status?: string } }) => (
    <div className={`w-24 h-14 ${data.status === 'reject' ? 'bg-red-500' : 'bg-blue-500'} text-white rounded-lg flex flex-col items-center justify-center shadow-lg`}>
      {data.status === 'reject' ? <X className="w-5 h-5 mb-1" /> : <Square className="w-5 h-5 mb-1" />}
      <span className="text-xs font-medium">{data.label}</span>
      <Handle type="target" position={Position.Left} className="bg-gray-400" />
    </div>
  ),
  user: ({ data }: { data: { label: string; userName?: string } }) => (
    <div className="w-32 h-20 bg-yellow-50 border-2 border-yellow-400 rounded-lg flex flex-col items-center justify-center shadow-md">
      <User className="w-6 h-6 text-yellow-600 mb-1" />
      <span className="text-xs font-medium text-gray-700">{data.label}</span>
      {data.userName && <span className="text-xs text-gray-500">{data.userName}</span>}
      <Handle type="target" position={Position.Left} className="bg-yellow-500" />
      <Handle type="source" position={Position.Right} className="bg-yellow-500" />
    </div>
  ),
  role: ({ data }: { data: { label: string; roleName?: string } }) => (
    <div className="w-32 h-20 bg-purple-50 border-2 border-purple-400 rounded-lg flex flex-col items-center justify-center shadow-md">
      <Users className="w-6 h-6 text-purple-600 mb-1" />
      <span className="text-xs font-medium text-gray-700">{data.label}</span>
      {data.roleName && <span className="text-xs text-gray-500">{data.roleName}</span>}
      <Handle type="target" position={Position.Left} className="bg-purple-500" />
      <Handle type="source" position={Position.Right} className="bg-purple-500" />
    </div>
  ),
  field: ({ data }: { data: { label: string; fieldName?: string } }) => (
    <div className="w-32 h-20 bg-orange-50 border-2 border-orange-400 rounded-lg flex flex-col items-center justify-center shadow-md">
      <FileText className="w-6 h-6 text-orange-600 mb-1" />
      <span className="text-xs font-medium text-gray-700">{data.label}</span>
      {data.fieldName && <span className="text-xs text-gray-500">{data.fieldName}</span>}
      <Handle type="target" position={Position.Left} className="bg-orange-500" />
      <Handle type="source" position={Position.Right} className="bg-orange-500" />
    </div>
  ),
  condition: ({ data }: { data: { label: string; condition?: string } }) => (
    <div className="w-32 h-20 bg-cyan-50 border-2 border-cyan-400 rounded-lg flex flex-col items-center justify-center shadow-md">
      <GitBranch className="w-6 h-6 text-cyan-600 mb-1" />
      <span className="text-xs font-medium text-gray-700">{data.label}</span>
      {data.condition && <span className="text-xs text-gray-500">{data.condition}</span>}
      <Handle type="target" position={Position.Left} className="bg-cyan-500" />
      <Handle type="source" position={Position.Top} className="bg-green-500" />
      <Handle type="source" position={Position.Bottom} className="bg-red-500" />
    </div>
  ),
}

export function ApprovalFlowDesigner({ nodes: initialNodes, onSave }: ApprovalFlowDesignerProps) {
  const [reactNodes, setReactNodes, onNodesChange] = useNodesState<Node<Record<string, unknown>>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node<Record<string, unknown>> | null>(null)
  const [showNodePanel, setShowNodePanel] = useState(false)

  useEffect(() => {
    if (initialNodes.length > 0) {
      const flowNodes: Node[] = initialNodes.map((node, index) => ({
        id: node.id.toString(),
        type: node.nodeType.toLowerCase(),
        position: { x: 100 + index * 150, y: 200 },
        data: {
          label: node.label,
          userName: node.userId?.toString(),
          roleName: node.roleId?.toString(),
          fieldName: node.fieldName,
          condition: node.conditionField,
        },
      }))
      setReactNodes(flowNodes)
    }
  }, [initialNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `edge-${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle,
      }
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const handleAddNode = (type: string, label: string) => {
    const newNode: Node = {
      id: `node-${Date.now()}`,
      type,
      position: { x: 200 + reactNodes.length * 50, y: 200 },
      data: { label },
    }
    setReactNodes((nds) => [...nds, newNode])
  }

  const handleNodeClick = (event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setShowNodePanel(true)
  }

  const handleSave = () => {
    const approvalNodes: DesignerNode[] = reactNodes.map((node, index) => {
      const data = node.data as Record<string, string | undefined>
      const nodeType = (node.type || 'USER').toUpperCase()
      return {
        id: parseInt(node.id) || index + 1,
        nodeType,
        nodeName: (data.label || '未命名节点') as string,
        nodeOrder: index,
        label: (data.label || '') as string,
        userId: nodeType === 'USER' ? (data.userName ? parseInt(data.userName) : null) : null,
        roleId: nodeType === 'ROLE' ? (data.roleName ? parseInt(data.roleName) : null) : null,
        fieldName: nodeType === 'FIELD' ? (data.fieldName || null) as string | null : null,
        conditionField: nodeType === 'CONDITION' ? (data.condition || null) as string | null : null,
        conditionOp: nodeType === 'CONDITION' ? '==' : null,
        conditionValue: null,
        nextNodeTrue: null,
        nextNodeFalse: null,
        canView: true,
        canEdit: false,
        canApprove: true,
        canTransfer: true,
      }
    })
    onSave(approvalNodes)
  }

  const handleDeleteNode = () => {
    if (selectedNode) {
      setReactNodes((nds) => nds.filter((n) => n.id !== selectedNode?.id))
      setEdges((eds) => eds.filter((e) => e.source !== selectedNode?.id && e.target !== selectedNode?.id))
      setSelectedNode(null)
      setShowNodePanel(false)
    }
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b bg-white flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleAddNode('start', '开始')}>
              <Play className="w-4 h-4 mr-1" />
              开始节点
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddNode('user', '指定用户')}>
              <User className="w-4 h-4 mr-1" />
              指定用户
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddNode('role', '指定角色')}>
              <Users className="w-4 h-4 mr-1" />
              指定角色
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddNode('field', '字段指定')}>
              <FileText className="w-4 h-4 mr-1" />
              字段指定
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddNode('condition', '条件分支')}>
              <GitBranch className="w-4 h-4 mr-1" />
              条件分支
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAddNode('end', '结束')}>
              <Square className="w-4 h-4 mr-1" />
              结束节点
            </Button>
          </div>
          <Button onClick={handleSave}>保存流程</Button>
        </div>
        <div className="flex-1">
          <ReactFlow
            nodes={reactNodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      <Dialog open={showNodePanel} onOpenChange={setShowNodePanel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>节点配置</DialogTitle>
          </DialogHeader>
          {selectedNode && (
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="label">节点名称</Label>
                <Input
                  id="label"
                  value={(selectedNode.data.label as string) || ''}
                  onChange={(e) =>
                    setReactNodes((nds) =>
                      nds.map((n) =>
                        n.id === selectedNode.id ? { ...n, data: { ...n.data, label: e.target.value } } : n
                      )
                    )
                  }
                />
              </div>

              {selectedNode.type === 'user' && (
                <div>
                  <Label htmlFor="userName">选择用户</Label>
                  <Select
                    value={(selectedNode.data.userName as string) || ''}
                    onValueChange={(value) =>
                      setReactNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id ? { ...n, data: { ...n.data, userName: value } } : n
                        )
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择用户" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">管理员</SelectItem>
                      <SelectItem value="2">录入员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.type === 'role' && (
                <div>
                  <Label htmlFor="roleName">选择角色</Label>
                  <Select
                    value={(selectedNode.data.roleName as string) || ''}
                    onValueChange={(value) =>
                      setReactNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id ? { ...n, data: { ...n.data, roleName: value } } : n
                        )
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="选择角色" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">管理员</SelectItem>
                      <SelectItem value="2">录入员</SelectItem>
                      <SelectItem value="3">查看员</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedNode.type === 'field' && (
                <div>
                  <Label htmlFor="fieldName">字段名称</Label>
                  <Input
                    id="fieldName"
                    value={(selectedNode.data.fieldName as string) || ''}
                    onChange={(e) =>
                      setReactNodes((nds) =>
                        nds.map((n) =>
                          n.id === selectedNode.id ? { ...n, data: { ...n.data, fieldName: e.target.value } } : n
                        )
                      )
                    }
                    placeholder="输入字段名称"
                  />
                </div>
              )}

              {selectedNode.type === 'condition' && (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="conditionField">条件字段</Label>
                    <Input
                      id="conditionField"
                      value={(selectedNode.data.condition as string) || ''}
                      onChange={(e) =>
                        setReactNodes((nds) =>
                          nds.map((n) =>
                            n.id === selectedNode.id ? { ...n, data: { ...n.data, condition: e.target.value } } : n
                          )
                        )
                      }
                      placeholder="输入条件字段"
                    />
                  </div>
                  <div>
                    <Label htmlFor="conditionOp">操作符</Label>
                    <Select defaultValue="==">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="==">=</SelectItem>
                        <SelectItem value="!=">!=</SelectItem>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value=">=">&gt;=</SelectItem>
                        <SelectItem value="<=">&lt;=</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="conditionValue">条件值</Label>
                    <Input id="conditionValue" placeholder="输入条件值" />
                  </div>
                </div>
              )}

              {selectedNode.type !== 'start' && selectedNode.type !== 'end' && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <Label>可查看</Label>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>可编辑</Label>
                    <Switch />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>可审批</Label>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label>可转交</Label>
                    <Switch defaultChecked />
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <Button variant="outline" onClick={handleDeleteNode}>
                  删除节点
                </Button>
                <Button onClick={() => setShowNodePanel(false)}>关闭</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}