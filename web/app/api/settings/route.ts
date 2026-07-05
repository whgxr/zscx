import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const settings = await prisma.systemSetting.findMany()
    const result: Record<string, string> = {}
    settings.forEach(s => {
      result[s.key] = s.value
    })

    return NextResponse.json({ settings: result })
  } catch (error) {
    console.error('Get settings error:', error)
    return NextResponse.json({ message: '获取设置失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const { settings } = body

    for (const [key, value] of Object.entries(settings)) {
      const existing = await prisma.systemSetting.findUnique({ where: { key } })
      if (existing) {
        await prisma.systemSetting.update({
          where: { key },
          data: { value: String(value) },
        })
      } else {
        await prisma.systemSetting.create({
          data: { key, value: String(value) },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update settings error:', error)
    return NextResponse.json({ message: '更新设置失败' }, { status: 500 })
  }
}
