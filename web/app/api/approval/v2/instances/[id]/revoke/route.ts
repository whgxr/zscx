import { NextRequest, NextResponse } from 'next/server'
import { revokeInstanceService } from '@/lib/approval-service'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, params: Promise<{ id: string }>) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const { id } = await params
    const instanceId = Number(id)
    const body = await req.json().catch(() => ({}))

    const fwd = req.headers.get('x-forwarded-for')
    const ip = fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? null)

    const ok = await revokeInstanceService(
      instanceId, user.id, body.reason ?? null,
      ip, req.headers.get('user-agent') ?? null,
    )
    return NextResponse.json({ ok })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '撤回失败' }, { status: 400 })
  }
}
