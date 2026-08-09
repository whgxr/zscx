/**
 * M2-T5 新建空白 v2 流程（不要求 nodes 字段，避免命中旧 zod schema）
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageApproval) return NextResponse.json({ ok: false, error: '无权限' }, { status: 403 })
    const body = await req.json()
    const name = String(body.name || '').trim()
    const tableId = Number(body.tableId)
    if (!name || !tableId) return NextResponse.json({ ok: false, error: '缺少 name 或 tableId' }, { status: 400 })
    const existingActive = await prisma.approvalWorkflow.findFirst({ where: { tableId, status: 'ACTIVE' } })
    const wf = await prisma.approvalWorkflow.create({
      data: {
        name, tableId,
        description: body.description || null,
        status: existingActive ? 'DRAFT' : 'DRAFT',
        isDefault: existingActive ? false : true,
        createdBy: user.id,
        canvasData: {
          nodes: [
            { id: 'start', type: 'approval', position: { x: 80, y: 240 }, data: { label: '开始', nodeType: 'START' } },
            { id: 'end', type: 'approval', position: { x: 520, y: 240 }, data: { label: '结束', nodeType: 'END' } },
          ],
          edges: [{ id: 'e_start_end', source: 'start', target: 'end', type: 'smoothstep', markerEnd: { type: 'ArrowClosed', color: '#6366f1' }, style: { stroke: '#6366f1', strokeWidth: 1.6 } }],
          viewport: { x: 0, y: 0, zoom: 1 }
        } as any,
      },
    })
    return NextResponse.json({ ok: true, data: { workflowId: wf.id, status: wf.status } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '创建失败' }, { status: 500 })
  }
}
