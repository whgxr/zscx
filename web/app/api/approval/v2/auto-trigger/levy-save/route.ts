import { NextRequest, NextResponse } from 'next/server'
import { tryLevySaveAutoTrigger, startInstance, matchWorkflowForTrigger, deepParse } from '@/lib/approval-service'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { createRecordSnapshot } from '@/lib/snapshot-utils'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })

  const body = await req.json()
  const tableId = Number(body.tableId)
  const recordId = Number(body.recordId)
  if (!tableId || !recordId) return NextResponse.json({ ok: false, error: '缺少参数' }, { status: 400 })

  const fwd = req.headers.get('x-forwarded-for')
  const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? null)

  const matched = await matchWorkflowForTrigger(tableId, 'LEVY_SAVE')
  if (!matched) return NextResponse.json({ ok: true, skipped: true, reason: 'LEVY_SAVE 未绑定流程' })

  const record = await prisma.dataRecord.findUnique({ where: { id: recordId } })
  if (!record) return NextResponse.json({ ok: false, error: '记录不存在' }, { status: 404 })

  const dataBefore = deepParse<any>(record.data) ?? {}
  const snapshot = await createRecordSnapshot({
    tableId, recordId, beforeData: dataBefore, afterData: dataBefore,
    changedBy: user.id, changeType: 'UPDATE',
    metadata: { workflowId: matched.workflowId, kind: 'LEVY_SAVE_AUTO_TRIGGER' },
  })

  const inst = await startInstance({
    tableId, recordId, initiatorId: user.id,
    triggerEvent: 'LEVY_SAVE',
    workflowIdOverride: matched.workflowId,
    workflowVersionOverride: matched.workflowVersion,
    ip, ua: req.headers.get('user-agent') ?? null,
  })
  if (!inst.ok) return NextResponse.json(inst, { status: 500 })

  try {
    await prisma.operationLog.create({
      data: {
        userId: user.id, action: 'APPROVAL_V2.LEVY_SAVE_AUTO_TRIGGER', module: 'APPROVAL_V2',
        tableId, recordId,
        snapshotId: snapshot.id, approvalInstanceId: inst.data?.instanceId,
        detail: { snapshotId: snapshot.id, instanceId: inst.data?.instanceId, matched } as any,
        ipAddress: ip ?? undefined,
        userAgent: req.headers.get('user-agent') ?? undefined,
      },
    })
  } catch (_) { /* */ }

  return NextResponse.json({ ok: true, data: { instanceId: inst.data?.instanceId, matched } })
}
