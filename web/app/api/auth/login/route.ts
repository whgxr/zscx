import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { comparePassword, createUserSession, setTokenCookie } from '@/lib/auth'
import {
  verifyCaptcha,
  checkLoginLocked,
  recordLoginFailure,
  clearLoginFailures,
} from '@/lib/captcha-store'
import { z } from 'zod'

const loginSchema = z.object({
  username: z.string().min(1, '用户名或手机号不能为空'),
  password: z.string().min(1, '密码不能为空'),
  captchaId: z.string().optional(),
  captchaCode: z.string().optional(),
})

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.ip || 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { username, password, captchaId, captchaCode } = loginSchema.parse(body)

    const ipAddress = getClientIp(req)

    // 1. 检查是否因多次失败被临时锁定
    const lockRemaining = await checkLoginLocked(username, ipAddress)
    if (lockRemaining > 0) {
      return NextResponse.json(
        { message: `登录失败次数过多，请 ${Math.ceil(lockRemaining / 60)} 分钟后再试` },
        { status: 429 }
      )
    }

    // 2. 校验图形验证码（一次性使用）
    const captchaOk = await verifyCaptcha(captchaId || '', captchaCode || '')
    if (!captchaOk) {
      return NextResponse.json(
        { message: '验证码错误或已过期，请重新输入' },
        { status: 400 }
      )
    }

    // 3. 校验用户名密码
    let user = await prisma.user.findUnique({
      where: { username },
      include: { role: true },
    })

    if (!user) {
      const isPhone = /^1[3-9]\d{9}$/.test(username)
      if (isPhone) {
        user = await prisma.user.findFirst({
          where: { phone: username },
          include: { role: true },
        })
      }
    }

    if (!user) {
      await recordLoginFailure(username, ipAddress)
      return NextResponse.json(
        { message: '用户名或密码错误' },
        { status: 401 }
      )
    }

    if (user.status !== 'ACTIVE') {
      await recordLoginFailure(username, ipAddress)
      return NextResponse.json(
        { message: '账户已被禁用，请联系管理员' },
        { status: 403 }
      )
    }

    const valid = await comparePassword(password, user.passwordHash)
    if (!valid) {
      await recordLoginFailure(username, ipAddress)
      return NextResponse.json(
        { message: '用户名或密码错误' },
        { status: 401 }
      )
    }

    // 登录成功，清除失败记录与锁定状态
    await clearLoginFailures(username, ipAddress)

    const rawUserAgent = req.headers.get('user-agent') || undefined
    const userAgent = rawUserAgent ? rawUserAgent.slice(0, 191) : undefined

    const { token } = await createUserSession(
      user.id,
      user.username,
      user.roleId,
      ipAddress,
      userAgent
    )

    setTokenCookie(token)

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        module: 'AUTH',
        ipAddress,
        userAgent,
      },
    })

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
        role: user.role,
        avatar: user.avatar,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Login error:', error)
    return NextResponse.json(
      { message: '登录失败，请稍后重试' },
      { status: 500 }
    )
  }
}
