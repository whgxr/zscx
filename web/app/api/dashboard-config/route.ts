import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const config = await prisma.userDashboardConfig.findUnique({
      where: { userId: user.id },
    })

    return NextResponse.json({ config: config?.config || null })
  } catch (error) {
    console.error('Get dashboard config error:', error)
    return NextResponse.json({ message: '获取配置失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const { config } = body

    if (!config || typeof config !== 'object') {
      return NextResponse.json({ message: '配置数据无效' }, { status: 400 })
    }

    const existing = await prisma.userDashboardConfig.findUnique({
      where: { userId: user.id },
    })

    if (existing) {
      await prisma.userDashboardConfig.update({
        where: { userId: user.id },
        data: { config: config as any },
      })
    } else {
      await prisma.userDashboardConfig.create({
        data: {
          userId: user.id,
          config: config as any,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update dashboard config error:', error)
    return NextResponse.json({ message: '保存配置失败' }, { status: 500 })
  }
}
