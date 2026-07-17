import { prisma } from './prisma'
import type { ApprovalInstance, ApprovalNode, DataRecord } from '@prisma/client'

export class ApprovalEngine {
  async onRecordSubmitted(record: DataRecord) {
    const workflow = await prisma.approvalWorkflow.findFirst({
      where: {
        tableId: record.tableId,
        status: 'ACTIVE'
      },
      include: {
        nodes: {
          orderBy: { nodeOrder: 'asc' }
        }
      }
    })

    if (!workflow) {
      console.log(`No active workflow found for table ${record.tableId}`)
      return null
    }

    const instance = await prisma.approvalInstance.create({
      data: {
        workflowId: workflow.id,
        tableId: record.tableId,
        recordId: record.id,
        initiatorId: record.createdBy,
        status: 'PENDING'
      }
    })

    await this.executeNextNode(instance, workflow.nodes)

    return instance
  }

  async executeNextNode(instance: ApprovalInstance, nodes: ApprovalNode[]) {
    const currentNodeIndex = instance.currentNodeId
      ? nodes.findIndex(n => n.id === instance.currentNodeId)
      : -1

    const nextNode = nodes[currentNodeIndex + 1]

    if (!nextNode) {
      await this.completeInstance(instance.id, 'APPROVED')
      return
    }

    if (nextNode.nodeType === 'CONDITION') {
      await this.executeConditionNode(instance, nextNode, nodes)
    } else {
      await this.executeApprovalNode(instance, nextNode)
    }
  }

  private async executeConditionNode(
    instance: ApprovalInstance,
    node: ApprovalNode,
    nodes: ApprovalNode[]
  ) {
    const record = await prisma.dataRecord.findUnique({
      where: { id: instance.recordId }
    })

    if (!record || !node.conditionField) {
      console.error('Condition evaluation failed: missing record or condition field')
      return
    }

    const conditionResult = this.evaluateCondition(
      record,
      node.conditionField,
      node.conditionOp || '==',
      node.conditionValue || ''
    )

    const nextNodeId = conditionResult ? node.nextNodeTrue : node.nextNodeFalse
    if (!nextNodeId) {
      console.error('Condition node missing next node ID')
      return
    }

    const nextNode = nodes.find(n => n.id === nextNodeId)
    if (nextNode) {
      await this.executeApprovalNode(instance, nextNode)
    }
  }

  private async executeApprovalNode(instance: ApprovalInstance, node: ApprovalNode) {
    const assigneeIds = await this.resolveAssignees(node, instance)

    if (assigneeIds.length === 0) {
      console.error('No assignees found for approval node')
      return
    }

    await prisma.approvalInstance.update({
      where: { id: instance.id },
      data: { currentNodeId: node.id }
    })

    for (const assigneeId of assigneeIds) {
      await prisma.approvalNodeInstance.create({
        data: {
          instanceId: instance.id,
          nodeId: node.id,
          assigneeId,
          status: 'PENDING'
        }
      })
    }

    await this.sendApprovalNotification(instance, node, assigneeIds)
  }

  private async resolveAssignees(node: ApprovalNode, instance: ApprovalInstance): Promise<number[]> {
    const assigneeIds: number[] = []

    if (node.nodeType === 'ROLE' && node.roleId) {
      const users = await prisma.user.findMany({
        where: { roleId: node.roleId, status: 'ACTIVE' },
        select: { id: true }
      })
      assigneeIds.push(...users.map(u => u.id))
    } else if (node.nodeType === 'USER' && node.userId) {
      assigneeIds.push(node.userId)
    } else if (node.nodeType === 'FIELD' && node.fieldName) {
      const record = await prisma.dataRecord.findUnique({
        where: { id: instance.recordId }
      })
      if (record && record.data) {
        const data = record.data as Record<string, any>
        const userId = data[node.fieldName]
        if (typeof userId === 'number') {
          assigneeIds.push(userId)
        }
      }
    }

    return assigneeIds
  }

  private evaluateCondition(
    record: DataRecord,
    field: string,
    op: string,
    value: string
  ): boolean {
    const data = record.data as Record<string, any>
    const fieldValue = data[field]

    if (fieldValue === undefined) return false

    const numValue = parseFloat(value)

    switch (op) {
      case '==':
        return fieldValue == value
      case '!=':
        return fieldValue != value
      case '>':
        return Number(fieldValue) > numValue
      case '<':
        return Number(fieldValue) < numValue
      case '>=':
        return Number(fieldValue) >= numValue
      case '<=':
        return Number(fieldValue) <= numValue
      default:
        return false
    }
  }

  private async sendApprovalNotification(
    instance: ApprovalInstance,
    node: ApprovalNode,
    assigneeIds: number[]
  ) {
    console.log(`Sending approval notification to users: ${assigneeIds.join(', ')}`)
  }

  private async completeInstance(instanceId: number, status: 'APPROVED' | 'REJECTED') {
    await prisma.approvalInstance.update({
      where: { id: instanceId },
      data: {
        status,
        completedAt: new Date()
      }
    })

    const instance = await prisma.approvalInstance.findUnique({
      where: { id: instanceId }
    })

    if (instance) {
      await prisma.dataRecord.update({
        where: { id: instance.recordId },
        data: {
          status: status === 'APPROVED' ? 'REVIEWED' : 'REJECTED',
          updatedAt: new Date()
        }
      })
    }
  }

  async approve(nodeInstanceId: number, userId: number, comment?: string) {
    const nodeInstance = await prisma.approvalNodeInstance.findUnique({
      where: { id: nodeInstanceId },
      include: {
        instance: {
          include: {
            workflow: {
              include: { nodes: { orderBy: { nodeOrder: 'asc' } } }
            }
          }
        },
        node: true
      }
    })

    if (!nodeInstance || nodeInstance.assigneeId !== userId) {
      throw new Error('Unauthorized or node instance not found')
    }

    if (!nodeInstance.node.canApprove) {
      throw new Error('No approval permission')
    }

    await prisma.approvalNodeInstance.update({
      where: { id: nodeInstanceId },
      data: {
        status: 'APPROVED',
        action: 'APPROVE',
        comment,
        processedAt: new Date()
      }
    })

    await this.executeNextNode(
      nodeInstance.instance,
      nodeInstance.instance.workflow.nodes
    )
  }

  async reject(nodeInstanceId: number, userId: number, comment?: string) {
    const nodeInstance = await prisma.approvalNodeInstance.findUnique({
      where: { id: nodeInstanceId },
      include: { instance: true, node: true }
    })

    if (!nodeInstance || nodeInstance.assigneeId !== userId) {
      throw new Error('Unauthorized or node instance not found')
    }

    if (!nodeInstance.node.canApprove) {
      throw new Error('No approval permission')
    }

    await prisma.approvalNodeInstance.update({
      where: { id: nodeInstanceId },
      data: {
        status: 'REJECTED',
        action: 'REJECT',
        comment,
        processedAt: new Date()
      }
    })

    await this.completeInstance(nodeInstance.instanceId, 'REJECTED')
  }

  async transfer(
    nodeInstanceId: number,
    userId: number,
    transferredToUserId: number,
    comment?: string
  ) {
    const nodeInstance = await prisma.approvalNodeInstance.findUnique({
      where: { id: nodeInstanceId },
      include: { instance: true, node: true }
    })

    if (!nodeInstance || nodeInstance.assigneeId !== userId) {
      throw new Error('Unauthorized or node instance not found')
    }

    if (!nodeInstance.node.canTransfer) {
      throw new Error('No transfer permission')
    }

    await prisma.approvalNodeInstance.update({
      where: { id: nodeInstanceId },
      data: {
        status: 'TRANSFERRED',
        action: 'TRANSFER',
        transferredTo: transferredToUserId,
        comment,
        processedAt: new Date()
      }
    })

    await prisma.approvalNodeInstance.create({
      data: {
        instanceId: nodeInstance.instanceId,
        nodeId: nodeInstance.nodeId,
        assigneeId: transferredToUserId,
        status: 'PENDING'
      }
    })
  }

  async cancel(instanceId: number, userId: number, reason: string) {
    const instance = await prisma.approvalInstance.findUnique({
      where: { id: instanceId }
    })

    if (!instance || instance.initiatorId !== userId) {
      throw new Error('Unauthorized or instance not found')
    }

    if (instance.status !== 'PENDING') {
      throw new Error('Can only cancel pending instances')
    }

    await prisma.approvalInstance.update({
      where: { id: instanceId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason
      }
    })

    await prisma.dataRecord.update({
      where: { id: instance.recordId },
      data: { status: 'DRAFT' }
    })
  }
}

export const approvalEngine = new ApprovalEngine()