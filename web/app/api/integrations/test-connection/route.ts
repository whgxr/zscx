import { NextRequest, NextResponse } from 'next/server'
import { integrationService } from '@/lib/integration-service'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '权限不足' }, { status: 403 })
    }

    const body = await req.json()
    const { platform } = body

    if (!platform) {
      return NextResponse.json({ message: '缺少平台参数' }, { status: 400 })
    }

    const result = await integrationService.testConnection(platform as any)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Test connection error:', error)
    return NextResponse.json({ success: false, message: error.message || '连接测试失败' }, { status: 500 })
  }
}