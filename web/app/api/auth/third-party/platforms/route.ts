import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 必须在运行时动态查询 IntegrationConfig，禁止构建时静态化
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const configs = await prisma.integrationConfig.findMany({
      where: { status: 'ENABLED' },
      select: { platform: true, status: true, appId: true, appSecret: true },
    })

    const platforms = configs.map(c => ({
      platform: c.platform.toLowerCase(),
      status: c.status,
      enabled: c.status === 'ENABLED',
      appId: c.appId,
      appSecret: c.appSecret ? '***' : null
    }))

    return NextResponse.json({ platforms })
  } catch (error) {
    console.error('[PlatformsAPI] Error:', error)
    return NextResponse.json({ platforms: [], error: error instanceof Error ? error.message : 'Unknown error' })
  }
}