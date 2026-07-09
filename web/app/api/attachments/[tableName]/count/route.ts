import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get('ids')

    if (!idsParam) {
      return NextResponse.json({ counts: {} })
    }

    const ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))

    if (ids.length === 0) {
      return NextResponse.json({ counts: {} })
    }

    const result = await prisma.recordAttachment.groupBy({
      by: ['recordId'],
      where: {
        recordId: { in: ids },
      },
      _count: {
        id: true,
      },
    })

    const counts: Record<number, number> = {}
    result.forEach(item => {
      counts[item.recordId] = item._count.id
    })

    return NextResponse.json({ counts })
  } catch (error) {
    console.error('Get attachment counts error:', error)
    return NextResponse.json({ counts: {} })
  }
}
