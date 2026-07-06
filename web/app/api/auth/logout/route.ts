import { NextResponse } from 'next/server'
import { clearTokenCookie, getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cookies } from 'next/headers'

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser()

    if (user) {
      const token = cookies().get('token')?.value
      if (token) {
        await prisma.userSession.updateMany({
          where: { token, isActive: true },
          data: { isActive: false },
        })
      }

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
    clearTokenCookie()
    return NextResponse.json({ success: true })
  }
}

