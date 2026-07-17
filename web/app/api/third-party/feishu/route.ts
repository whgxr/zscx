import { NextRequest, NextResponse } from 'next/server'
import { feishuService } from '@/lib/feishu'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId: user.id, platform: 'FEISHU' } },
      include: { user: { select: { realName: true } } },
    })

    return NextResponse.json({ binding })
  } catch (error) {
    console.error('Get Feishu binding error:', error)
    return NextResponse.json({ message: '获取飞书绑定信息失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const { code } = body

    if (!code) {
      return NextResponse.json({ message: '缺少授权码' }, { status: 400 })
    }

    const binding = await feishuService.bindUser(user.id, code)
    return NextResponse.json({ binding })
  } catch (error) {
    console.error('Bind Feishu error:', error)
    return NextResponse.json({ message: '绑定飞书失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    await feishuService.unbindUser(user.id)
    return NextResponse.json({ message: '解绑成功' })
  } catch (error) {
    console.error('Unbind Feishu error:', error)
    return NextResponse.json({ message: '解绑失败' }, { status: 500 })
  }
}