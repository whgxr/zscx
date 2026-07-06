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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的ID' }, { status: 400 })
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

    const versionLog = await prisma.versionLog.update({
      where: { id },
      data: {
        version: data.version,
        title: data.title,
        description: data.description,
        changes: data.changes as any,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
      },
    })

    return NextResponse.json({ success: true, log: versionLog })
  } catch (error) {
    console.error('Update version log error:', error)
    return NextResponse.json({ message: '更新版本日志失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的ID' }, { status: 400 })
    }

    await prisma.versionLog.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete version log error:', error)
    return NextResponse.json({ message: '删除版本日志失败' }, { status: 500 })
  }
}
