/**
 * M2-T6 保存表级触发绑定（DataTable.approvalTriggerConfig + featureFlags）
 * Body: { tableId, approvalTriggerConfig: { MANUAL_SUBMIT:{...}, ... }, featureFlags: { enableApprovalV2, enableLevyFeatures } }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role?.name !== 'ADMIN' && !user.role?.canManageApproval && !user.role?.canManageTables)) {
      return NextResponse.json({ ok: false, error: '无权限（需要管理员/审批管理员/表管理权限）' }, { status: 403 })
    }
    const body = await req.json()
    const tableId = Number(body.tableId)
    if (!tableId) return NextResponse.json({ ok: false, error: '缺少 tableId' }, { status: 400 })
    const table = await prisma.dataTable.findUnique({ where: { id: tableId }, select: { id: true, featureFlags: true, approvalTriggerConfig: true } })
    if (!table) return NextResponse.json({ ok: false, error: '表不存在' }, { status: 404 })

    const nextFlags = { ...(typeof table.featureFlags === 'object' ? table.featureFlags : {}), ...(body.featureFlags ?? {}) }
    const nextConfig = { ...(typeof table.approvalTriggerConfig === 'object' ? table.approvalTriggerConfig : {}), ...(body.approvalTriggerConfig ?? {}) }

    // 校验：启用的绑定必须指向该表（或跨表，但 workflowId 必须真实存在）
    for (const [ev, cfg] of Object.entries(nextConfig) as any[]) {
      if (!cfg || !cfg.enabled) continue
      if (!cfg.workflowId) return NextResponse.json({ ok: false, error: `事件 ${ev} 启用了但没选 workflowId` }, { status: 400 })
      const wf = await prisma.approvalWorkflow.findUnique({ where: { id: Number(cfg.workflowId) }, select: { id: true, status: true } })
      if (!wf) return NextResponse.json({ ok: false, error: `事件 ${ev} 指向的 workflowId=${cfg.workflowId} 不存在` }, { status: 400 })
    }

    const updated = await prisma.dataTable.update({
      where: { id: tableId },
      data: {
        featureFlags: nextFlags as any,
        approvalTriggerConfig: nextConfig as any,
      },
      select: { approvalTriggerConfig: true, featureFlags: true }
    })
    return NextResponse.json({ ok: true, data: updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '保存失败' }, { status: 500 })
  }
}
