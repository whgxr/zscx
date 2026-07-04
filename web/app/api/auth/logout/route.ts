import { NextResponse } from 'next/server'
import { clearTokenCookie, getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()
    
    if (user) {
      await prisma.operationLog.create({
        data: {
          userId: user.id,
          action: 'LOGOUT',
          module: 'AUTH',
        },
      })
    }

    clearTokenCookie()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ success: true })
  }
}
