import { NextRequest, NextResponse } from 'next/server'
import { weworkService } from '@/lib/wework'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const binding = await prisma.userThirdPartyBinding.findUnique({
      where: { userId_platform: { userId: user.id, platform: 'WEWORK' } },
      include: { user: { select: { realName: true } } },
    })

    return NextResponse.json({ binding })
  } catch (error) {
    console.error('Get WeWork binding error:', error)
    return NextResponse.json({ message: '获取企业微信绑定信息失败' }, { status: 500 })
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

    const binding = await weworkService.bindUser(user.id, code)
    return NextResponse.json({ binding })
  } catch (error) {
    console.error('Bind WeWork error:', error)
    return NextResponse.json({ message: '绑定企业微信失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    await weworkService.unbindUser(user.id)
    return NextResponse.json({ message: '解绑成功' })
  } catch (error) {
    console.error('Unbind WeWork error:', error)
    return NextResponse.json({ message: '解绑失败' }, { status: 500 })
  }
}