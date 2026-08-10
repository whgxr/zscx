import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { integrationService } from '@/lib/integration-service'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    const platform = searchParams.get('platform') as any

    if (action === 'test' && platform) {
      const result = await integrationService.testConnection(platform)
      return NextResponse.json(result)
    }

    if (action === 'bindings') {
      const allBindings = await integrationService.getAllUserBindings()
      const bindingsByPlatform = allBindings.reduce((acc: any, b: any) => {
        if (!acc[b.platform]) acc[b.platform] = []
        acc[b.platform].push(b)
        return acc
      }, {})
      return NextResponse.json({ bindings: bindingsByPlatform })
    }

    if (action === 'no-bindings' && platform) {
      const users = await integrationService.getUsersWithoutBinding(platform)
      return NextResponse.json({ users })
    }

    const configs = await integrationService.getAllConfigs()
    return NextResponse.json({ configs })
  } catch (error) {
    console.error('Get integration config error:', error)
    return NextResponse.json({ message: '获取集成配置失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const config = await integrationService.upsertConfig(body)
    return NextResponse.json({ config })
  } catch (error: any) {
    console.error('Update integration config error:', error)
    return NextResponse.json({ message: error.message || '更新集成配置失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const platform = searchParams.get('platform') as any

    if (!platform) {
      return NextResponse.json({ message: '缺少平台参数' }, { status: 400 })
    }

    await integrationService.deleteConfig(platform)
    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('Delete integration config error:', error)
    return NextResponse.json({ message: '删除集成配置失败' }, { status: 500 })
  }
}