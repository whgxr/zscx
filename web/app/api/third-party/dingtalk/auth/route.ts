import { NextRequest, NextResponse } from 'next/server'
import { dingtalkService } from '@/lib/dingtalk'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const redirectUri = searchParams.get('redirectUri') || `${req.nextUrl.origin}/dashboard/profile`

    if (!code) {
      const user = await getCurrentUser()
      if (!user) {
        return NextResponse.redirect(new URL('/login', req.url))
      }

      const config = await prisma.integrationConfig.findUnique({
        where: { platform: 'DINGTALK' }
      })

      if (!config || config.status !== 'ENABLED') {
        return NextResponse.redirect(new URL('/dashboard/profile?error=钉钉集成未配置', req.url))
      }

      await dingtalkService.loadConfig(config)
      const authUrl = dingtalkService.getOAuthAuthorizeUrl(redirectUri, String(user.id))
      return NextResponse.redirect(authUrl)
    }

    const userId = state ? parseInt(state) : null
    if (!userId) {
      return NextResponse.redirect(new URL(redirectUri + '?error=授权参数错误', req.url))
    }

    const config = await prisma.integrationConfig.findUnique({
      where: { platform: 'DINGTALK' }
    })

    if (config) {
      await dingtalkService.loadConfig(config)
    }

    await dingtalkService.bindUser(userId, code)
    return NextResponse.redirect(new URL(redirectUri, req.url))
  } catch (error: any) {
    console.error('DingTalk auth callback error:', error)
    const redirectUri = new URL('/dashboard/profile', req.url)
    redirectUri.searchParams.set('error', error.message || '钉钉授权失败')
    return NextResponse.redirect(redirectUri)
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code || !state) {
      return NextResponse.json({ message: '缺少授权参数' }, { status: 400 })
    }

    const userId = parseInt(state)
    const config = await prisma.integrationConfig.findUnique({
      where: { platform: 'DINGTALK' }
    })

    if (config) {
      await dingtalkService.loadConfig(config)
    }

    const binding = await dingtalkService.bindUser(userId, code)
    return NextResponse.json({ success: true, binding })
  } catch (error: any) {
    console.error('DingTalk auth callback error:', error)
    return NextResponse.json({ message: error.message || '钉钉授权失败' }, { status: 500 })
  }
}