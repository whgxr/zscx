import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const createWorkflowSchema = z.object({
  name: z.string().min(1, '流程名称不能为空'),
  tableId: z.number().int().positive(),
  description: z.string().optional(),
  nodes: z.array(z.object({
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
  })),
})

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

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const tableId = searchParams.get('tableId') ? parseInt(searchParams.get('tableId')!) : undefined

    const where: any = {}
    if (tableId) {
      where.tableId = tableId
    }

    const [workflows, total] = await Promise.all([
      prisma.approvalWorkflow.findMany({
        where,
        include: {
          table: { select: { label: true, name: true } },
          nodes: { orderBy: { nodeOrder: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.approvalWorkflow.count({ where }),
    ])

    return NextResponse.json({ workflows, total, page, pageSize })
  } catch (error) {
    console.error('Get workflows error:', error)
    return NextResponse.json({ message: '获取审批流程列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const data = createWorkflowSchema.parse(body)

    const existing = await prisma.approvalWorkflow.findFirst({
      where: { tableId: data.tableId, status: 'ACTIVE' },
    })

    if (existing) {
      return NextResponse.json({ message: '该表已存在启用的审批流程' }, { status: 400 })
    }

    const workflow = await prisma.approvalWorkflow.create({
      data: {
        name: data.name,
        tableId: data.tableId,
        description: data.description,
        nodes: {
          create: data.nodes.map(node => ({
            nodeType: node.nodeType,
            nodeOrder: node.nodeOrder,
            nodeName: node.label || '未命名节点',
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
        },
      },
      include: { nodes: true },
    })

    return NextResponse.json({ workflow })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Create workflow error:', error)
    return NextResponse.json({ message: '创建审批流程失败' }, { status: 500 })
  }
}