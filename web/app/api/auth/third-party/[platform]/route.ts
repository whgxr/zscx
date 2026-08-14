import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getPublicUrl } from '@/lib/base-url'

const PLATFORM_NAMES: Record<string, string> = {
  feishu: '飞书',
  wework: '企业微信',
  dingtalk: '钉钉'
}

export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  try {
    const platform = params.platform.toLowerCase()

    if (!['feishu', 'wework', 'dingtalk'].includes(platform)) {
      return NextResponse.json({ error: '不支持的平台' }, { status: 400 })
    }

    const platformUpper = platform.toUpperCase() as 'FEISHU' | 'WEWORK' | 'DINGTALK'

    const config = await prisma.integrationConfig.findUnique({
      where: { platform: platformUpper }
    })

    if (!config || !config.appId || !config.appSecret || config.status !== 'ENABLED') {
      const errorUrl = new URL('/login', req.url)
      errorUrl.searchParams.set('error', `${PLATFORM_NAMES[platform]}登录未启用`)
      return NextResponse.redirect(errorUrl)
    }

    const callbackUrl = getPublicUrl(req, `/api/auth/third-party/${platform}/callback`)
    const state = `login_${Date.now()}`

    let authUrl: string

    if (platform === 'feishu') {
      const params = new URLSearchParams({
        app_id: config.appId,
        redirect_uri: callbackUrl,
        state,
        response_type: 'code',
        scope: 'contact:user.base:readonly'
      })
      authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?${params.toString()}`
    } else if (platform === 'wework') {
      const corpId = config.corpId || ''
      const params = new URLSearchParams({
        appid: corpId,
        redirect_uri: callbackUrl,
        state,
        response_type: 'code',
        scope: 'snsapi_privateinfo'
      })
      authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?${params.toString()}#wechat_redirect`
    } else {
      const params = new URLSearchParams({
        redirect_uri: callbackUrl,
        response_type: 'code',
        client_id: config.appId,
        scope: 'openid',
        state
      })
      authUrl = `https://login.dingtalk.com/oauth2/auth?${params.toString()}`
    }

    console.log(`[ThirdPartyLogin] Redirecting ${platform} login: ${authUrl}`)
    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('Third party login error:', error)
    const errorUrl = new URL('/login', req.url)
    errorUrl.searchParams.set('error', '第三方登录初始化失败')
    return NextResponse.redirect(errorUrl)
  }
}
