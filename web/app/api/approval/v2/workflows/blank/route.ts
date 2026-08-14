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
    // 流程与表解耦：tableId 可选，后续在“表级触发绑定”中为各表触发事件选择本流程
    const tableId = body.tableId != null && body.tableId !== '' ? Number(body.tableId) : null
    if (!name) return NextResponse.json({ ok: false, error: '缺少 name' }, { status: 400 })
    const wf = await prisma.approvalWorkflow.create({
      data: {
        name,
        tableId: Number.isFinite(tableId as number) ? (tableId as number) : null,
        description: body.description || null,
        status: 'DRAFT',
        isDefault: false,
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
