"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Play, 
  Square, 
  User as UserIcon,
  Users,
  FileText,
  GitBranch,
  Plus,
  Edit,
  Trash2,
  Eye,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ApprovalFlowDesigner } from '@/components/approval-flow-designer'
import type { User } from '@prisma/client'

interface WorkflowTable {
  label: string
  name: string
}

interface WorkflowNode {
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

interface ApprovalWorkflowWithTable extends Omit<import('@prisma/client').ApprovalWorkflow, 'table'> {
  table: WorkflowTable | null
  nodes: WorkflowNode[]
}

interface InstanceInitiator {
  realName: string | null
  username: string
}

interface InstanceNode {
  id: number
  nodeType: string
  nodeName: string
}

interface InstanceNodeInstance {
  id: number
  node: InstanceNode
  status: string
  assigneeId: number | null
  assignee?: { realName: string | null }
}

interface ApprovalInstanceWithRelations extends Omit<import('@prisma/client').ApprovalInstance, 'table' | 'initiator'> {
  table: WorkflowTable | null
  initiator: InstanceInitiator | null
  nodeInstances: InstanceNodeInstance[]
}

interface ApprovalClientProps {
  user: User
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-600',
  APPROVED: 'bg-green-100 text-green-600',
  REJECTED: 'bg-red-100 text-red-600',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

const statusLabels: Record<string, string> = {
  PENDING: '审批中',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
}

export function ApprovalClient({ user }: ApprovalClientProps) {
  const router = useRouter()
  const [workflows, setWorkflows] = useState<ApprovalWorkflowWithTable[]>([])
  const [instances, setInstances] = useState<ApprovalInstanceWithRelations[]>([])
  const [selectedWorkflow, setSelectedWorkflow] = useState<ApprovalWorkflowWithTable | null>(null)
  const [showDesigner, setShowDesigner] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [activeTab, setActiveTab] = useState('workflows')

  useEffect(() => {
    loadWorkflows()
    loadInstances()
  }, [])

  const loadWorkflows = async () => {
    try {
      const res = await fetch('/api/approval/workflows')
      if (res.ok) {
        const data = await res.json()
        setWorkflows(data.workflows || [])
      }
    } catch (error) {
      console.error('Failed to load workflows:', error)
    }
  }

  const loadInstances = async () => {
    try {
      const res = await fetch('/api/approval/instances')
      if (res.ok) {
        const data = await res.json()
        setInstances(data.instances || [])
      }
    } catch (error) {
      console.error('Failed to load instances:', error)
    }
  }

  const handleSaveWorkflow = async (nodes: any[]) => {
    try {
      const data = {
        name: selectedWorkflow?.name || '新流程',
        tableId: selectedWorkflow?.tableId || 1,
        description: selectedWorkflow?.description || '',
        nodes,
      }
      if (selectedWorkflow?.id) {
        await fetch(`/api/approval/workflows/${selectedWorkflow.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      } else {
        await fetch('/api/approval/workflows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      }
      setShowDesigner(false)
      loadWorkflows()
    } catch (error) {
      console.error('Failed to save workflow:', error)
    }
  }

  const handleDeleteWorkflow = async (id: number) => {
    if (!confirm('确定要删除这个审批流程吗？')) return
    try {
      const res = await fetch(`/api/approval/workflows/${id}`, { method: 'DELETE' })
      if (res.ok) {
        loadWorkflows()
      }
    } catch (error) {
      console.error('Failed to delete workflow:', error)
    }
  }

  const handleActivateWorkflow = async (id: number) => {
    try {
      await fetch(`/api/approval/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      })
      loadWorkflows()
    } catch (error) {
      console.error('Failed to activate workflow:', error)
    }
  }

  const handleDeactivateWorkflow = async (id: number) => {
    try {
      await fetch(`/api/approval/workflows/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INACTIVE' }),
      })
      loadWorkflows()
    } catch (error) {
      console.error('Failed to deactivate workflow:', error)
    }
  }

  const handleApprove = async (nodeInstanceId: number) => {
    try {
      await fetch(`/api/approval/nodes/${nodeInstanceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'APPROVE' }),
      })
      loadInstances()
    } catch (error) {
      console.error('Failed to approve:', error)
    }
  }

  const handleReject = async (nodeInstanceId: number) => {
    try {
      await fetch(`/api/approval/nodes/${nodeInstanceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REJECT' }),
      })
      loadInstances()
    } catch (error) {
      console.error('Failed to reject:', error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">审批管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理审批流程和处理审批任务</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="workflows">审批流程</TabsTrigger>
          <TabsTrigger value="instances">审批实例</TabsTrigger>
        </TabsList>

        <TabsContent value="workflows" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <Input
              placeholder="搜索流程名称..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="w-64"
            />
            <Button onClick={() => {
              setSelectedWorkflow(null)
              setShowDesigner(true)
            }}>
              <Plus className="w-4 h-4 mr-2" />
              创建流程
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.filter(w => 
              w.name.toLowerCase().includes(searchKeyword.toLowerCase())
            ).map((workflow) => (
              <Card key={workflow.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">{workflow.name}</h3>
                      <Badge className={workflow.status === 'ACTIVE' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}>
                        {workflow.status === 'ACTIVE' ? '启用' : '禁用'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{workflow.description || '暂无描述'}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>关联表: {workflow.table?.label || '未关联'}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setSelectedWorkflow(workflow)
                    setShowDesigner(true)
                  }}>
                    <Edit className="w-4 h-4 mr-1" />
                    编辑
                  </Button>
                  {workflow.status === 'INACTIVE' ? (
                    <Button variant="ghost" size="sm" onClick={() => handleActivateWorkflow(workflow.id)}>
                      <Play className="w-4 h-4 mr-1" />
                      启用
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => handleDeactivateWorkflow(workflow.id)}>
                      <Square className="w-4 h-4 mr-1" />
                      禁用
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => handleDeleteWorkflow(workflow.id)}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {workflows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <FileText className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">暂无审批流程</p>
              <p className="text-sm">点击上方按钮创建第一个审批流程</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="instances" className="mt-6">
          <div className="flex items-center gap-4 mb-4">
            <Select defaultValue="all">
              <SelectTrigger className="w-40">
                <SelectValue placeholder="状态筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                <SelectItem value="PENDING">审批中</SelectItem>
                <SelectItem value="APPROVED">已通过</SelectItem>
                <SelectItem value="REJECTED">已拒绝</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadInstances}>
              <RefreshCw className="w-4 h-4 mr-1" />
              刷新
            </Button>
          </div>

          <div className="space-y-4">
            {instances.map((instance) => (
              <Card key={instance.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{instance.table?.label}</h4>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-4 h-4" />
                          {instance.initiator?.realName || '未知用户'}
                        </span>
                        <span>{new Date(instance.startedAt).toLocaleString('zh-CN')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <Badge className={statusColors[instance.status]}>
                      {statusLabels[instance.status]}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4 mr-1" />
                      查看详情
                    </Button>
                  </div>
                </div>

                {instance.nodeInstances?.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      {instance.nodeInstances.map((nodeInst, index) => (
                        <div key={nodeInst.id} className="flex items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                            nodeInst.status === 'PENDING' ? 'bg-yellow-100 text-yellow-600' :
                            nodeInst.status === 'APPROVED' ? 'bg-green-100 text-green-600' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {nodeInst.status === 'PENDING' ? <Clock className="w-4 h-4" /> :
                             nodeInst.status === 'APPROVED' ? <CheckCircle className="w-4 h-4" /> :
                             <XCircle className="w-4 h-4" />}
                          </div>
                          <span className="ml-2 text-sm text-gray-600">{nodeInst.node?.nodeName}</span>
                          <span className="ml-1 text-xs text-gray-400">{nodeInst.assignee?.realName}</span>
                          {index < instance.nodeInstances.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-gray-300 mx-2" />
                          )}
                        </div>
                      ))}
                    </div>

                    {instance.nodeInstances.some(ni => ni.status === 'PENDING' && ni.assigneeId === user.id) && (
                      <div className="flex items-center gap-2 mt-4">
                        <Button onClick={() => {
                          const pendingNode = instance.nodeInstances.find(ni => ni.status === 'PENDING' && ni.assigneeId === user.id)
                          if (pendingNode) handleApprove(pendingNode.id)
                        }}>
                          <CheckCircle className="w-4 h-4 mr-1" />
                          同意
                        </Button>
                        <Button variant="outline" onClick={() => {
                          const pendingNode = instance.nodeInstances.find(ni => ni.status === 'PENDING' && ni.assigneeId === user.id)
                          if (pendingNode) handleReject(pendingNode.id)
                        }}>
                          <XCircle className="w-4 h-4 mr-1" />
                          拒绝
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {instances.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Clock className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-lg">暂无审批实例</p>
              <p className="text-sm">提交数据后会自动创建审批实例</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showDesigner} onOpenChange={setShowDesigner}>
        <DialogContent className="max-w-full max-h-[90vh] p-0">
          <DialogHeader>
            <DialogTitle>{selectedWorkflow ? '编辑审批流程' : '创建审批流程'}</DialogTitle>
          </DialogHeader>
          <div className="h-[70vh]">
            <ApprovalFlowDesigner 
              nodes={selectedWorkflow?.nodes || []} 
              onSave={handleSaveWorkflow} 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}