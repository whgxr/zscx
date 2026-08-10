import { NextRequest, NextResponse } from 'next/server'
import { integrationService } from '@/lib/integration-service'
import { getCurrentUser } from '@/lib/auth'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '权限不足' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const platform = searchParams.get('platform')

    if (platform) {
      const config = await integrationService.getConfig(platform as any)
      return NextResponse.json({ config })
    }

    const configs = await integrationService.getAllConfigs()
    return NextResponse.json({ configs })
  } catch (error) {
    console.error('Get integrations error:', error)
    return NextResponse.json({ message: '获取集成配置失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '权限不足' }, { status: 403 })
    }

    const body = await req.json()
    const config = await integrationService.upsertConfig(body)
    return NextResponse.json({ config })
  } catch (error: any) {
    console.error('Create integration error:', error)
    return NextResponse.json({ message: error.message || '创建集成配置失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '权限不足' }, { status: 403 })
    }

    const body = await req.json()
    const { platform, ...data } = body
    if (!platform) {
      return NextResponse.json({ message: '缺少平台参数' }, { status: 400 })
    }

    const config = await integrationService.upsertConfig({ platform, ...data })
    return NextResponse.json({ config })
  } catch (error: any) {
    console.error('Update integration error:', error)
    return NextResponse.json({ message: error.message || '更新集成配置失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '权限不足' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const platform = searchParams.get('platform')

    if (!platform) {
      return NextResponse.json({ message: '缺少平台参数' }, { status: 400 })
    }

    await integrationService.deleteConfig(platform as any)
    return NextResponse.json({ message: '删除成功' })
  } catch (error) {
    console.error('Delete integration error:', error)
    return NextResponse.json({ message: '删除集成配置失败' }, { status: 500 })
  }
}