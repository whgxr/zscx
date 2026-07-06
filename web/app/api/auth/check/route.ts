import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json(
        { valid: false, message: '登录已过期或在其他设备登录' },
        { status: 401 }
      )
    }

    return NextResponse.json({
      valid: true,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { valid: false, message: '验证失败' },
      { status: 401 }
    )
  }
}