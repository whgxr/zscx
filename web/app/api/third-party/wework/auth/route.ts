import { NextRequest, NextResponse } from 'next/server'
import { weworkService } from '@/lib/wework'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.redirect(new URL('/login', req.url))
    }

    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const redirectUri = searchParams.get('redirectUri') || `${req.nextUrl.origin}/dashboard/profile`

    if (!code) {
      return NextResponse.redirect(new URL(redirectUri, req.url))
    }

    await weworkService.bindUser(user.id, code)

    return NextResponse.redirect(new URL(redirectUri, req.url))
  } catch (error) {
    console.error('WeWork auth error:', error)
    const redirectUri = new URL('/dashboard/profile', req.url)
    redirectUri.searchParams.set('error', '企业微信绑定失败')
    return NextResponse.redirect(redirectUri)
  }
}