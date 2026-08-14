import { NextRequest } from 'next/server'

export function getPublicBaseUrl(req?: NextRequest): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')
  }

  if (req) {
    const forwardedProto = req.headers.get('x-forwarded-proto')
    const forwardedHost = req.headers.get('x-forwarded-host')
    const host = forwardedHost || req.headers.get('host')
    const proto = forwardedProto || req.nextUrl.protocol.replace(':', '')

    if (host) {
      return `${proto}://${host}`
    }
  }

  if (req) {
    return req.nextUrl.origin
  }

  return 'http://localhost:3000'
}

export function getPublicUrl(req: NextRequest, path: string): string {
  const baseUrl = getPublicBaseUrl(req)
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${cleanPath}`
}
