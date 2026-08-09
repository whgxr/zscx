import { NextRequest, NextResponse } from 'next/server'
import { executeNodeAction } from '@/lib/approval-service'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const body = await req.json()

    if (!body.nodeInstanceId) {
      return NextResponse.json({ ok: false, error: '缺少 nodeInstanceId' }, { status: 400 })
    }

    const fwd = req.headers.get('x-forwarded-for')
    const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? null)

    const result = await executeNodeAction({
      nodeInstanceId: Number(body.nodeInstanceId),
      assigneeId: user.id,
      action: body.action,
      comment: body.comment ?? null,
      transferredTo: body.transferredTo ?? null,
      addCountersignIds: body.addCountersignIds,
      gotoNodeKey: body.gotoNodeKey ?? null,
      restart: body.restart,
      restartWithWorkflowId: body.restartWithWorkflowId ?? null,
      ip,
      ua: req.headers.get('user-agent') ?? null,
    })

    if (!result.ok) {
      const status = result.error?.startsWith('OPTIMISTIC_LOCK_FAIL') ? 409 : (result.status ?? 500)
      return NextResponse.json(result, { status })
    }
    return NextResponse.json(result)
  } catch (e: any) {
    console.error('nodeAction route:', e)
    if (e.message?.startsWith('OPTIMISTIC_LOCK_FAIL')) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 409 })
    }
    return NextResponse.json({ ok: false, error: e.message ?? '未知错误' }, { status: 500 })
  }
}
