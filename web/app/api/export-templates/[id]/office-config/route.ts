import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { buildOfficeConfig, OfficeKind } from '@/lib/office-config'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/export-templates/[id]/office-config?kind=word|cell
 * 返回 ONLYOFFICE 编辑器配置（JWT 签名）。
 * 模板须已有对应文件（documentFileKey / spreadsheetFileKey），否则 400 提示先初始化文件。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const templateId = parseInt(params.id)
    const kind: OfficeKind = req.nextUrl.searchParams.get('kind') === 'cell' ? 'cell' : 'word'
    const tpl = await prisma.exportTemplate.findUnique({
      where: { id: templateId },
      include: { table: { include: { fields: { orderBy: { id: 'asc' } } } } },
    })
    if (!tpl) return NextResponse.json({ message: '模板不存在' }, { status: 404 })

    // 可插入字段列表（供「点击字段插入」插件渲染面板）
    const fields = (tpl.table?.fields || []).map((f: any) => ({ name: f.name, label: f.label || f.name }))

    const fileKey = kind === 'cell' ? tpl.spreadsheetFileKey : tpl.documentFileKey
    if (!fileKey) {
      return NextResponse.json({ message: '模板尚未初始化文件，请先初始化' }, { status: 400 })
    }
    const fileType = kind === 'cell' ? 'xlsx' : 'docx'

    // 业务系统 baseUrl（document.url / callbackUrl）。
    // document.url 除 DS 后端下载外，ONLYOFFICE 前端也会用浏览器直接访问做预览/加载，
    // 故必须与请求来源同源：内网请求用内网地址、外网请求用公网域名，否则外网浏览器访问内网 IP 失败(-4)。
    // 注：DS 容器对 内网REDACTED_IP:777 与 公网REDACTED_DOMAIN 两条路径下载均已验证可通。
    const internal = (process.env.ONLYOFFICE_INTERNAL_URL || '').replace(/\/$/, '')
    const envBase = (process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || '').replace(/\/$/, '')
    const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.nextUrl.protocol.replace(/:$/, '')
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || ''
    const reqBase = host ? `${proto}://${host}` : ''
    const isInternalReq = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\.|^127\.|^[a-z_-]+$/.test(host || '')
    const baseUrl = isInternalReq ? (reqBase || internal || envBase) : (envBase || reqBase || internal)
    // 插件资源由浏览器加载，须与用户当前访问地址同源（同 baseUrl 原则）。
    const pluginBase = baseUrl

    const cfg = buildOfficeConfig({
      kind,
      fileKey,
      fileType,
      title: tpl.name,
      templateId: tpl.id,
      userName: user.realName || user.username,
      mode: 'edit',
      baseUrl,
      pluginBase,
      fields,
    })
    // DS 地址：前端加载编辑器。外网用公网域名；内网用内网 IP（host 判定）。
    const dsUrl = isInternalReq
      ? (process.env.ONLYOFFICE_DS_URL || 'http://REDACTED_IP:8088')
      : (process.env.ONLYOFFICE_PUBLIC_DS_URL || process.env.ONLYOFFICE_DS_URL || 'http://REDACTED_IP:8088')
    return NextResponse.json({ ds: dsUrl, ...cfg })
  } catch (e: any) {
    console.error('[office-config] error', e)
    return NextResponse.json({ message: e.message || '获取配置失败' }, { status: 500 })
  }
}