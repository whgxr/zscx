import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createUserSession, setTokenCookie } from '@/lib/auth'

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const state = searchParams.get('state')
    const code = searchParams.get('code')

    if (!state) {
      return NextResponse.json({ success: false, status: 'error', message: '缺少state参数' })
    }

    const loginState = global.weChatLoginStates?.get(state)

    if (!loginState) {
      return NextResponse.json({ success: false, status: 'expired', message: '二维码已过期' })
    }

    if (Date.now() - loginState.createdAt.getTime() > 5 * 60 * 1000) {
      loginState.status = 'expired'
      return NextResponse.json({ success: false, status: 'expired', message: '二维码已过期' })
    }

    if (code) {
      const appId = process.env.WECHAT_APP_ID || ''
      const appSecret = process.env.WECHAT_APP_SECRET || ''

      if (!appId || !appSecret) {
        const mockUser = await handleMockLogin(state)
        if (mockUser) {
          setTokenCookie(mockUser.token)
          return NextResponse.json({
            success: true,
            user: {
              id: mockUser.user.id,
              username: mockUser.user.username,
              realName: mockUser.user.realName,
              role: mockUser.user.role,
            },
          })
        }
        return NextResponse.json({ success: false, status: 'pending', message: '等待扫码' })
      }

      try {
        const tokenRes = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`)
        const tokenData = await tokenRes.json()

        if (tokenData.access_token) {
          const userRes = await fetch(`https://api.weixin.qq.com/sns/userinfo?access_token=${tokenData.access_token}&openid=${tokenData.openid}`)
          const userData = await userRes.json()

          const user = await handleWeChatUser(userData)
          setTokenCookie(user.token)

          loginState.status = 'confirmed'
          loginState.openid = tokenData.openid
          loginState.unionid = tokenData.unionid

          return NextResponse.json({
            success: true,
            user: {
              id: user.user.id,
              username: user.user.username,
              realName: user.user.realName,
              role: user.user.role,
            },
          })
        }
      } catch (err) {
        console.error('WeChat API error:', err)
      }
    }

    return NextResponse.json({ success: false, status: loginState.status })
  } catch (error) {
    console.error('WeChat callback error:', error)
    return NextResponse.json({ success: false, status: 'error' })
  }
}

async function handleMockLogin(state: string) {
  try {
    const user = await prisma.user.findFirst({
      where: { status: 'ACTIVE' },
      include: { role: true },
    })

    if (!user) {
      return null
    }

    const { token } = await createUserSession(
      user.id,
      user.username,
      user.roleId,
      undefined,
      undefined
    )

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        module: 'AUTH',
        detail: { method: 'wechat_mock' },
      },
    })

    return { user, token }
  } catch (err) {
    console.error('Mock login error:', err)
    return null
  }
}

async function handleWeChatUser(wechatData: any) {
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: wechatData.openid },
        { phone: wechatData.openid },
      ],
    },
    include: { role: true },
  })

  if (!user) {
    user = await prisma.user.create({
      data: {
        username: wechatData.openid,
        passwordHash: '',
        realName: wechatData.nickname || '微信用户',
        phone: '',
        roleId: 3,
        avatar: wechatData.headimgurl,
      },
      include: { role: true },
    })
  }

  const { token } = await createUserSession(
    user.id,
    user.username,
    user.roleId,
    undefined,
    undefined
  )

  await prisma.operationLog.create({
    data: {
      userId: user.id,
      action: 'LOGIN',
      module: 'AUTH',
      detail: { method: 'wechat' },
    },
  })

  return { user, token }
}