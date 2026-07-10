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
  const { pathname, searchParams } = request.nextUrl
  const userAgent = request.headers.get('user-agent') || ''

  // 根路径：根据设备跳转
  if (pathname === '/') {
    if (isMobile(userAgent)) {
      return NextResponse.redirect(new URL('/h5', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // 手机访问 /login 时，跳转到 H5 登录页，保留 redirect 参数
  if (pathname === '/login' && isMobile(userAgent)) {
    const redirect = searchParams.get('redirect')
    const h5LoginUrl = new URL('/h5/login', request.url)
    if (redirect) {
      h5LoginUrl.searchParams.set('redirect', redirect)
    }
    return NextResponse.redirect(h5LoginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login'],
}