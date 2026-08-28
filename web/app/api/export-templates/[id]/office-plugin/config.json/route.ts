import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/export-templates/[id]/office-plugin/config.json?kind=word|cell
 * 返回「字段插入」插件 manifest（社区版 ONLYOFFICE 可用）。
 * config.json 由 ONLYOFFICE 编辑器跨域取回，故必须是公开路由（不能依赖会话 cookie），
 * 并加 CORS 头。variations.url 指向本系统动态 index.html 路由，字段列表由该路由内联注入插件。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const templateId = parseInt(params.id)
  const kind = req.nextUrl.searchParams.get('kind') === 'word' ? 'word' : 'cell'

  // 插件 baseUrl 由浏览器加载（插件 iframe/资源），须与用户当前访问地址同源：
  // 内网访问 REDACTED_IP:777 时用内网、外网访问 REDACTED_DOMAIN 时用公网。
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.nextUrl.protocol.replace(/:$/, '')
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
  const reqBase = host ? `${proto}://${host}` : ''
  const envBase = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || '').replace(/\/$/, '')
  const isInternalReq = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^127\.|^[a-z_-]+$/.test(host || '')
  const appBase = isInternalReq ? (reqBase || envBase) : (envBase || reqBase)
  // baseUrl 必须为业务系统插件文件目录的绝对地址，url 用相对 index.html，
  // 这样 ONLYOFFICE 才能拼出业务系统上的插件 HTML（而非 DS 自身 sdkjs-plugins）。
  const pluginBase = `${appBase}/api/export-templates/${templateId}/office-plugin/`

  const plugin = {
    name: '字段插入',
    guid: 'asc.{2125EF82-8D20-4E45-9C7B-7A3C3B6D9E01}',
    version: '1.0.0',
    baseUrl: pluginBase,
    variations: [
      {
        description: '在光标处插入表单字段占位符 {{name}}',
        url: `index.html?templateId=${templateId}&kind=${kind}`,
        isViewer: false,
        EditorsSupport: ['word', 'cell'],
        isVisual: true,
        isModal: false,
        isInsideMode: false,
        initDataType: 'none',
        initData: '',
        isUpdateOleOnResize: true,
        size: [320, 420],
        store: { background: { light: '#f8fafc', dark: '#1e293b' } },
        buttons: [],
      },
    ],
  }

  return new NextResponse(JSON.stringify(plugin, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    },
  })
}