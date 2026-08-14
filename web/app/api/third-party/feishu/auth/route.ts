import { NextRequest, NextResponse } from 'next/server'
import { feishuService } from '@/lib/feishu'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPublicUrl } from '@/lib/base-url'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { searchParams } = new URL(req.url)
    const callbackUrl = getPublicUrl(req, '/api/third-party/feishu/auth/callback')

    const config = await prisma.integrationConfig.findUnique({
      where: { platform: 'FEISHU' }
    })

    if (!config || !config.appId || config.status !== 'ENABLED') {
      console.log('[FeishuAuth] 飞书未启用或未配置')
      const errorUrl = new URL('/dashboard/profile', req.url)
      errorUrl.searchParams.set('error', '飞书平台未启用，请先在集成管理中配置')
      return NextResponse.redirect(errorUrl)
    }

    await feishuService.loadConfig(config)

    const state = `bind_${user.id}_${Date.now()}`
    const oauthUrl = feishuService.getOAuthAuthorizeUrl(callbackUrl, state)

    console.log(`[FeishuAuth] Redirecting to Feishu OAuth: appId=${config.appId}`)
    console.log(`[FeishuAuth] State: ${state}, Callback: ${callbackUrl}`)
    console.log(`[FeishuAuth] OAuth URL: ${oauthUrl}`)

    return NextResponse.redirect(oauthUrl)
  } catch (error) {
    console.error('Feishu auth error:', error)
    const redirectUrl = new URL('/dashboard/profile', req.url)
    redirectUrl.searchParams.set('error', '飞书授权初始化失败')
    return NextResponse.redirect(redirectUrl)
  }
}
