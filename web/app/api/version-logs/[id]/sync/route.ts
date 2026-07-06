import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { sendVersionLogNotification, getFeishuConfig } from '@/lib/feishu'

export async function POST(
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

    const config = await getFeishuConfig()
    if (!config.enabled || !config.webhookUrl) {
      return NextResponse.json(
        { success: false, message: '飞书配置未启用或Webhook地址未设置' },
        { status: 400 }
      )
    }

    const versionLog = await prisma.versionLog.findUnique({
      where: { id },
    })

    if (!versionLog) {
      return NextResponse.json({ message: '版本日志不存在' }, { status: 404 })
    }

    const changes = versionLog.changes as any
    const success = await sendVersionLogNotification({
      version: versionLog.version,
      title: versionLog.title,
      description: versionLog.description || undefined,
      changes: {
        features: changes?.features || [],
        fixes: changes?.fixes || [],
        improvements: changes?.improvements || [],
      },
      releaseDate: versionLog.releaseDate || undefined,
    })

    if (success) {
      return NextResponse.json({ success: true, message: '同步成功' })
    } else {
      return NextResponse.json(
        { success: false, message: '同步失败，请检查飞书配置' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Sync version log error:', error)
    return NextResponse.json({ message: '同步失败' }, { status: 500 })
  }
}
