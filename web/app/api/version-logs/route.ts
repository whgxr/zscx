import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { sendVersionLogNotification, type VersionChange } from '@/lib/feishu'
import { z } from 'zod'

const versionLogSchema = z.object({
  version: z.string().min(1, '版本号不能为空'),
  title: z.string().min(1, '标题不能为空'),
  description: z.string().optional(),
  changes: z.object({
    features: z.array(z.string()).default([]),
    fixes: z.array(z.string()).default([]),
    improvements: z.array(z.string()).default([]),
  }),
  releaseDate: z.string().optional().nullable(),
})

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const total = await prisma.versionLog.count()
    const logs = await prisma.versionLog.findMany({
      orderBy: { releaseDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    })

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Get version logs error:', error)
    return NextResponse.json({ message: '获取版本日志失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const validated = versionLogSchema.safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { message: '参数错误', errors: validated.error.errors },
        { status: 400 }
      )
    }

    const data = validated.data

    const versionLog = await prisma.versionLog.create({
      data: {
        version: data.version,
        title: data.title,
        description: data.description,
        changes: data.changes as any,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
        createdBy: user.id,
      },
    })

    const autoSync = body.autoSync !== false
    if (autoSync) {
      sendVersionLogNotification({
        version: data.version,
        title: data.title,
        description: data.description,
        changes: data.changes as VersionChange,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : undefined,
      }).catch(err => {
        console.error('Auto sync feishu failed:', err)
      })
    }

    return NextResponse.json({ success: true, log: versionLog })
  } catch (error) {
    console.error('Create version log error:', error)
    return NextResponse.json({ message: '创建版本日志失败' }, { status: 500 })
  }
}
