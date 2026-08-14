import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { type ApprovalNode } from '@prisma/client'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })
    if (!user.role?.canManageApproval) return NextResponse.json({ message: '无权限' }, { status: 403 })

    const srcId = Number(params.id)
    const body = await req.json()
    const src = await prisma.approvalWorkflow.findUnique({
      where: { id: srcId },
      include: { nodes: true },
    })
    if (!src) return NextResponse.json({ message: '源流程不存在' }, { status: 404 })

    const newName = body.name ?? `${src.name} (副本 ${new Date().toLocaleTimeString()})`
    const newTableId = body.tableId != null ? Number(body.tableId) : src.tableId

    const copy = await prisma.$transaction(async (tx: any) => {
      const wf = await tx.approvalWorkflow.create({
        data: {
          name: newName,
          tableId: newTableId ?? undefined,
          description: body.description ?? src.description ?? null,
          isDefault: false,
          version: 1,
          status: 'DRAFT',
          triggerEvents: src.triggerEvents ?? undefined,
          timeoutPolicy: src.timeoutPolicy ?? undefined,
          jsonDefinition: src.jsonDefinition ?? undefined,
          canvasData: src.canvasData ?? undefined,
          createdBy: user.id,
        }
      })
      if (src.nodes && src.nodes.length) {
        const clone = src.nodes.map((n: ApprovalNode) => ({
          workflowId: wf.id,
          nodeKey: n.nodeKey,
          nodeType: n.nodeType,
          nodeName: n.nodeName,
        }))
        await tx.approvalNode.createMany({ data: clone as any })
      }
      return wf
    })

    return NextResponse.json({ ok: true, data: { newId: copy.id, name: copy.name } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
