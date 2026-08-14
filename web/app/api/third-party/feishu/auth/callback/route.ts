import { NextRequest, NextResponse } from 'next/server'
import { feishuService } from '@/lib/feishu'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getPublicUrl } from '@/lib/base-url'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const challenge = searchParams.get('challenge')
    const type = searchParams.get('type')
    const state = searchParams.get('state')

    console.log(`[FeishuCallback] GET request: code=${code ? 'present' : 'null'}, challenge=${challenge || 'null'}, type=${type || 'null'}, state=${state || 'null'}`)

    if (challenge) {
      console.log('[FeishuCallback] Responding to challenge verification')
      return NextResponse.json({ challenge })
    }

    if (type === 'url_verification') {
      const token = searchParams.get('token')
      console.log('[FeishuCallback] URL verification, responding with token')
      return NextResponse.json({ challenge: token || '' })
    }

    if (code) {
      console.log('[FeishuCallback] Processing OAuth callback with code')

      let userId: number | null = null

      if (state && state.startsWith('bind_')) {
        const parts = state.split('_')
        if (parts.length >= 2) {
          userId = parseInt(parts[1], 10)
        }
      }

      if (!userId) {
        const user = await getCurrentUser()
        if (!user) {
          const loginUrl = new URL('/login', req.url)
          loginUrl.searchParams.set('redirect', '/dashboard/profile')
          return NextResponse.redirect(loginUrl)
        }
        userId = user.id
      }

      if (!userId) {
        throw new Error('无法确定当前用户')
      }

      const config = await prisma.integrationConfig.findUnique({
        where: { platform: 'FEISHU' }
      })

      if (!config || !config.appId || config.status !== 'ENABLED') {
        throw new Error('飞书平台未启用或未配置')
      }

      await feishuService.loadConfig(config)

      const binding = await feishuService.bindUser(userId, code)
      console.log(`[FeishuCallback] User ${userId} bound to Feishu: openId=${binding.platformUserId}`)

      const redirectPath = '/dashboard/profile?bindSuccess=feishu'
      const redirectUrl = getPublicUrl(req, redirectPath)
      console.log(`[FeishuCallback] Redirecting to: ${redirectUrl}`)
      return NextResponse.redirect(redirectUrl)
    }

    return NextResponse.json({ code: 0, msg: 'Feishu webhook endpoint is working' })
  } catch (error) {
    console.error('Feishu callback error:', error)
    const errorPath = `/dashboard/profile?error=${encodeURIComponent(`飞书绑定失败: ${error instanceof Error ? error.message : '未知错误'}`)}`
    const redirectUrl = getPublicUrl(req, errorPath)
    console.log(`[FeishuCallback] Error redirect to: ${redirectUrl}`)
    return NextResponse.redirect(redirectUrl)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const { type, challenge, token, event } = body

    console.log(`[FeishuCallback] POST request: type=${type}, eventId=${event?.event_id || 'null'}`)

    if (type === 'url_verification' && challenge) {
      console.log('[FeishuCallback] POST URL verification, responding with challenge')
      return NextResponse.json({ challenge })
    }

    if (event) {
      console.log(`[FeishuCallback] Event: type=${event.type}, id=${event.event_id}`)

      if (event.type === 'approval_instance' || event.type === 'approval_task') {
        console.log('[FeishuCallback] Approval event received')
      }
    }

    return NextResponse.json({ code: 0, msg: 'success' })
  } catch (error) {
    console.error('Feishu webhook POST error:', error)
    return NextResponse.json({ code: -1, msg: 'Internal server error' }, { status: 500 })
  }
}
