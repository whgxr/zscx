import { NextRequest, NextResponse } from 'next/server'
import { notificationService } from '@/lib/notification-service'
import { getCurrentUser } from '@/lib/auth'
import { z } from 'zod'

const publishSchema = z.object({
  type: z.enum(['SYSTEM', 'BUSINESS']),
  title: z.string().min(1, '标题不能为空'),
  content: z.string().min(1, '内容不能为空'),
  targetType: z.enum(['ALL', 'ROLE', 'USER']),
  targetRoleId: z.number().int().optional(),
  targetUserIds: z.array(z.number().int()).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
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
    const type = searchParams.get('type') || undefined
    const includeRead = searchParams.get('includeRead') !== 'false'

    const notifications = await notificationService.getNotifications(user.id, {
      type: type as any,
      page,
      pageSize,
      includeRead,
    })

    const unreadCount = await notificationService.getUnreadCount(user.id)

    return NextResponse.json({ notifications, unreadCount, page, pageSize })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ message: '获取通知列表失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canPublishNotification) {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const body = await req.json()
    const data = publishSchema.parse(body)

    const notification = await notificationService.createNotification({
      type: data.type,
      title: data.title,
      content: data.content,
      targetType: data.targetType,
      targetRoleId: data.targetRoleId,
      targetUserIds: data.targetUserIds,
      priority: data.priority,
      createdBy: user.id,
    })

    return NextResponse.json({ notification })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: error.errors[0]?.message || '参数错误' },
        { status: 400 }
      )
    }
    console.error('Publish notification error:', error)
    return NextResponse.json({ message: '发布通知失败' }, { status: 500 })
  }
}