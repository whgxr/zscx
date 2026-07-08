import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

declare global {
  var weChatLoginStates: Map<string, {
    status: 'pending' | 'scanned' | 'confirmed' | 'expired'
    openid?: string
    unionid?: string
    nickname?: string
    avatar?: string
    createdAt: Date
  }> | undefined
}

const WECHAT_QRCODE_EXPIRE_TIME = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const state = crypto.randomUUID()
    const appId = process.env.WECHAT_APP_ID || ''
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/wechat/callback`

    if (!appId) {
      return NextResponse.json({
        success: false,
        message: '微信登录功能未配置，请联系管理员',
      }, { status: 400 })
    }

    const authUrl = `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`

    global.weChatLoginStates = global.weChatLoginStates || new Map()
    global.weChatLoginStates.set(state, {
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