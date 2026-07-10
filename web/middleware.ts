import { NextRequest, NextResponse } from 'next/server'

// 移动端User-Agent关键词
const MOBILE_KEYWORDS = [
  'Mobile', 'Android', 'iPhone', 'iPad', 'iPod',
  'webOS', 'BlackBerry', 'Windows Phone', 'Opera Mini',
  'IEMobile', 'MicroMessenger', 'AlipayClient', 'DingTalk',
]

function isMobile(userAgent: string): boolean {
  return MOBILE_KEYWORDS.some(keyword => userAgent.includes(keyword))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const userAgent = request.headers.get('user-agent') || ''

  // 只处理根路径 /
  if (pathname === '/') {
    if (isMobile(userAgent)) {
      return NextResponse.redirect(new URL('/h5', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // 已登录用户从PC页面访问时，如果误入/h5，自动跳回PC
  // 但如果明确访问/h5（非根路径），不做拦截，允许手动访问
  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}