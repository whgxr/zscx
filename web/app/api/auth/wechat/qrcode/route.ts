import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateToken, setTokenCookie } from '@/lib/auth'
import crypto from 'crypto'

const weChatLoginStates = new Map<string, {
  status: 'pending' | 'scanned' | 'confirmed' | 'expired'
  openid?: string
  unionid?: string
  nickname?: string
  avatar?: string
  createdAt: Date
}>()

const WECHAT_QRCODE_EXPIRE_TIME = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const state = crypto.randomUUID()
    const appId = process.env.WECHAT_APP_ID || ''
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/wechat/callback`

    if (!appId) {
      weChatLoginStates.set(state, {
        status: 'pending',
        createdAt: new Date(),
      })

      const qrcodeDataUrl = generateMockQrcode(state)
      return NextResponse.json({
        success: true,
        qrcode: qrcodeDataUrl,
        state,
        message: '微信登录功能尚未配置，此为演示模式',
      })
    }

    const authUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`

    weChatLoginStates.set(state, {
      status: 'pending',
      createdAt: new Date(),
    })

    return NextResponse.json({
      success: true,
      authUrl,
      state,
    })
  } catch (error) {
    console.error('WeChat QR code error:', error)
    return NextResponse.json(
      { message: '获取微信二维码失败' },
      { status: 500 }
    )
  }
}

function generateMockQrcode(state: string): string {
  const qrcodeContent = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(state)}`
  return qrcodeContent
}