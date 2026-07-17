import { NextRequest, NextResponse } from 'next/server'
import { notificationService } from '@/lib/notification-service'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    switch (action) {
      case 'read':
        await notificationService.markAsRead(parseInt(params.id), user.id)
        break
      case 'delete':
        await notificationService.deleteNotification(parseInt(params.id), user.id)
        break
      default:
        return NextResponse.json({ message: '未知操作' }, { status: 400 })
    }

    return NextResponse.json({ message: '操作成功' })
  } catch (error) {
    console.error('Notification action error:', error)
    return NextResponse.json({ message: '操作失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    await notificationService.deleteNotification(parseInt(params.id), user.id)
    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('Delete notification error:', error)
    return NextResponse.json({ message: '删除失败' }, { status: 500 })
  }
}