import { NextResponse } from 'next/server'
import { integrationService } from '@/lib/integration-service'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '权限不足' }, { status: 403 })
    }

    const allBindings = await integrationService.getAllUserBindings()

    const grouped: Record<string, any[]> = {}
    for (const binding of allBindings) {
      const platform = binding.platform
      if (!grouped[platform]) {
        grouped[platform] = []
      }
      grouped[platform].push(binding)
    }

    return NextResponse.json({ bindings: grouped })
  } catch (error) {
    console.error('Get bindings error:', error)
    return NextResponse.json({ message: '获取绑定信息失败' }, { status: 500 })
  }
}