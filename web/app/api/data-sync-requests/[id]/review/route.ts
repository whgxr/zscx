import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'
import { applyApprovedSyncRequest, rejectSyncRequest } from '@/lib/levy-sync-detector'

const reviewSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reviewComment: z.string().max(1000).optional(),
})

// POST /api/data-sync-requests/[id]/review
// 审核同步请求（通过则回写征收记录，拒绝则标记 REJECTED）
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    // v1.2.2 权限简化：管理岗（ADMIN/MANAGER）或 super admin 可审核；后期接入审批引擎后替换
    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER' && user.id !== 1) {
      return NextResponse.json({ message: '无审核权限' }, { status: 403 })
    }

    const id = parseInt(params.id, 10)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的 id' }, { status: 400 })
    }

    const body = reviewSchema.parse(await req.json())

    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    let result
    if (body.decision === 'APPROVED') {
      result = await applyApprovedSyncRequest({
        syncRequestId: id,
        reviewedBy: user.id,
        reviewComment: body.reviewComment || null,
        ipAddress,
        userAgent,
      })
    } else {
      result = await rejectSyncRequest({
        syncRequestId: id,
        reviewedBy: user.id,
        reviewComment: body.reviewComment || null,
        ipAddress,
        userAgent,
      })
    }

    if (!result.ok) {
      return NextResponse.json({ message: result.error }, { status: 400 })
    }

    return NextResponse.json({ ok: true, syncRequest: result.syncRequest })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.errors[0]?.message || '参数错误' }, { status: 400 })
    }
    console.error('[api/data-sync-requests review] error:', error)
    return NextResponse.json({ message: '审核失败' }, { status: 500 })
  }
}
