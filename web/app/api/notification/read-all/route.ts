import { NextRequest, NextResponse } from 'next/server'
import { notificationService } from '@/lib/notification-service'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    await notificationService.markAllAsRead(user.id)
    return NextResponse.json({ message: '标记全部已读成功' })
  } catch (error) {
    console.error('Mark all as read error:', error)
    return NextResponse.json({ message: '操作失败' }, { status: 500 })
  }
}