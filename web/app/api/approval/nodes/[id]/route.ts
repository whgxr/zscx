import { NextRequest, NextResponse } from 'next/server'
import { executeNodeAction } from '@/lib/approval-service'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const actionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'TRANSFER']),
  comment: z.string().optional(),
  transferredTo: z.number().int().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const data = actionSchema.parse(body)

    const nodeInstanceId = parseInt(params.id)
    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const ua = req.headers.get('user-agent') || null

    const res = await executeNodeAction({
      nodeInstanceId,
      assigneeId: user.id,
      action: data.action,
      comment: data.comment ?? null,
      transferredTo: data.transferredTo ?? null,
      ip,
      ua,
    })

    if (!res.ok) {
      return NextResponse.json({ message: res.error ?? '操作失败' }, { status: res.status ?? 400 })
    }

    return NextResponse.json({ message: '操作成功' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Approval action error:', error)
    return NextResponse.json({ message: (error as Error).message || '操作失败' }, { status: 500 })
  }
}