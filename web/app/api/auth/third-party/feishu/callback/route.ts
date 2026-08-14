import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { feishuService } from '@/lib/feishu'
import { getPublicUrl } from '@/lib/base-url'
import { generateToken, createUserSession } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    console.log(`[ThirdPartyCallback] Feishu: code=${code ? 'present' : 'null'}, state=${state || 'null'}`)

    if (!code) {
      throw new Error('缺少授权码')
    }

    const config = await prisma.integrationConfig.findUnique({
      where: { platform: 'FEISHU' }
    })

    if (!config || !config.appId || !config.appSecret || config.status !== 'ENABLED') {
      throw new Error('飞书登录未启用')
    }

    await feishuService.loadConfig(config)

    const { accessToken } = await feishuService.getUserAccessToken(code)
    const userInfo = await feishuService.getUserInfo(accessToken)

    let user = null

    const existingBinding = await prisma.userThirdPartyBinding.findFirst({
      where: {
        platform: 'FEISHU',
        platformUserId: userInfo.open_id
      },
      include: { user: true }
    })

    if (existingBinding?.user) {
      user = existingBinding.user
    }

    if (!user) {
      const registerUrl = getPublicUrl(req, 
        `/register?feishu_open_id=${encodeURIComponent(userInfo.open_id)}&feishu_name=${encodeURIComponent(userInfo.name || '')}`)
      console.log(`[ThirdPartyCallback] No binding found, redirecting to register`)
      return NextResponse.redirect(registerUrl)
    }

    if (user.status !== 'ACTIVE') {
      const loginUrl = getPublicUrl(req, '/login?error=账户已禁用，请联系管理员')
      return NextResponse.redirect(loginUrl)
    }

    const token = generateToken({
      userId: user.id,
      username: user.username,
      roleId: user.roleId
    })

    await createUserSession(user.id, user.username, user.roleId)

    const dashboardUrl = getPublicUrl(req, '/dashboard')
    const response = NextResponse.redirect(dashboardUrl)

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    })

    console.log(`[ThirdPartyCallback] Feishu login success: userId=${user.id}`)
    return response
  } catch (error) {
    console.error('Feishu login callback error:', error)
    const loginUrl = getPublicUrl(req, 
      `/login?error=${encodeURIComponent(error instanceof Error ? error.message : '飞书登录失败')}`)
    return NextResponse.redirect(loginUrl)
  }
}
