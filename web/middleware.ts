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

  // ONLYOFFICE 插件资源：DS(不同源)会跨域 fetch /plugins/ 下的 config.json/index.html，
  // 业务系统需返回 CORS 头允许 DS 访问，否则插件加载失败(net::ERR_FAILED)。
  if (pathname.startsWith('/plugins/')) {
    const resp = NextResponse.next()
    resp.headers.set('Access-Control-Allow-Origin', '*')
    resp.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    resp.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    resp.headers.set('Cache-Control', 'no-store')
    return resp
  }

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
  matcher: ['/', '/login', '/plugins/:path*'],
}