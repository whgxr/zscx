import { NextRequest, NextResponse } from 'next/server'
import { approvalEngine } from '@/lib/approval-engine'
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

    switch (data.action) {
      case 'APPROVE':
        await approvalEngine.approve(nodeInstanceId, user.id, data.comment)
        break
      case 'REJECT':
        await approvalEngine.reject(nodeInstanceId, user.id, data.comment)
        break
      case 'TRANSFER':
        if (!data.transferredTo) {
          return NextResponse.json({ message: '请指定转交对象' }, { status: 400 })
        }
        await approvalEngine.transfer(nodeInstanceId, user.id, data.transferredTo, data.comment)
        break
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