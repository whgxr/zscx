import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const updateWorkflowSchema = z.object({
  name: z.string().min(1, '流程名称不能为空').optional(),
  description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  nodes: z.array(z.object({
    id: z.number().int().optional(),
    nodeType: z.enum(['START', 'END', 'USER', 'ROLE', 'FIELD', 'CONDITION']),
    nodeOrder: z.number().int(),
    label: z.string().min(1),
    userId: z.number().int().optional(),
    roleId: z.number().int().optional(),
    fieldName: z.string().optional(),
    conditionField: z.string().optional(),
    conditionOp: z.enum(['==', '!=', '>', '<', '>=', '<=']).optional(),
    conditionValue: z.string().optional(),
    nextNodeTrue: z.number().int().optional(),
    nextNodeFalse: z.number().int().optional(),
    canView: z.boolean().default(true),
    canEdit: z.boolean().default(false),
    canApprove: z.boolean().default(true),
    canTransfer: z.boolean().default(true),
  })).optional(),
})

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: parseInt(params.id) },
      include: {
        table: { select: { label: true, name: true } },
        nodes: {
          orderBy: { nodeOrder: 'asc' },
          include: {
            role: { select: { name: true, label: true } },
            user: { select: { realName: true, username: true } },
          },
        },
      },
    })

    if (!workflow) {
      return NextResponse.json({ message: '审批流程不存在' }, { status: 404 })
    }

    return NextResponse.json({ workflow })
  } catch (error) {
    console.error('Get workflow error:', error)
    return NextResponse.json({ message: '获取审批流程失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const data = updateWorkflowSchema.parse(body)

    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: parseInt(params.id) },
    })

    if (!workflow) {
      return NextResponse.json({ message: '审批流程不存在' }, { status: 404 })
    }

    if (data.status === 'ACTIVE') {
      const existing = await prisma.approvalWorkflow.findFirst({
        where: { tableId: workflow.tableId, status: 'ACTIVE', id: { not: workflow.id } },
      })
      if (existing) {
        return NextResponse.json({ message: '该表已存在启用的审批流程' }, { status: 400 })
      }
    }

    const updateData: any = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.description !== undefined) updateData.description = data.description
    if (data.status !== undefined) updateData.status = data.status

    if (data.nodes) {
      await prisma.approvalNode.deleteMany({ where: { workflowId: parseInt(params.id) } })
      updateData.nodes = {
        create: data.nodes.map(node => ({
          nodeType: node.nodeType,
          nodeOrder: node.nodeOrder,
          label: node.label,
          userId: node.userId,
          roleId: node.roleId,
          fieldName: node.fieldName,
          conditionField: node.conditionField,
          conditionOp: node.conditionOp,
          conditionValue: node.conditionValue,
          nextNodeTrue: node.nextNodeTrue,
          nextNodeFalse: node.nextNodeFalse,
          canView: node.canView,
          canEdit: node.canEdit,
          canApprove: node.canApprove,
          canTransfer: node.canTransfer,
        })),
      }
    }

    const updatedWorkflow = await prisma.approvalWorkflow.update({
      where: { id: parseInt(params.id) },
      data: updateData,
      include: { nodes: true },
    })

    return NextResponse.json({ workflow: updatedWorkflow })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Update workflow error:', error)
    return NextResponse.json({ message: '更新审批流程失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const workflow = await prisma.approvalWorkflow.findUnique({
      where: { id: parseInt(params.id) },
    })

    if (!workflow) {
      return NextResponse.json({ message: '审批流程不存在' }, { status: 404 })
    }

    const hasInstances = await prisma.approvalInstance.findFirst({
      where: { workflowId: parseInt(params.id) },
    })

    if (hasInstances) {
      return NextResponse.json({ message: '该流程存在审批实例，无法删除' }, { status: 400 })
    }

    await prisma.approvalWorkflow.delete({
      where: { id: parseInt(params.id) },
    })

    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('Delete workflow error:', error)
    return NextResponse.json({ message: '删除审批流程失败' }, { status: 500 })
  }
}