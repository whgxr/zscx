import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/export-templates/[id]/office-plugin/index.html?kind=word|cell
 * 返回「字段插入」插件 HTML，并把当前模板的字段列表内联注入到 window.__ZSCX_FIELDS__。
 * 该 iframe 由 ONLYOFFICE 编辑器跨域加载，故为公开路由，须加 CORS 头。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const templateId = parseInt(params.id)
    const kind = req.nextUrl.searchParams.get('kind') === 'word' ? 'word' : 'cell'

    // 读取插件静态 HTML
    const filePath = path.join(process.cwd(), 'public', 'plugins', 'zscx-field-insert', 'index.html')
    let html = fs.readFileSync(filePath, 'utf8')

    // 查模板关联表的字段
    let fields: { name: string; label: string }[] = []
    try {
      const tpl = await prisma.exportTemplate.findUnique({
        where: { id: templateId },
        include: { table: { include: { fields: { orderBy: { id: 'asc' } } } } },
      })
      fields = (tpl?.table?.fields || []).map((f: any) => ({ name: f.name, label: f.label || f.name }))
    } catch {
      // DB 不可达时保持空列表，插件仍能渲染空态
    }

    // 注入字段 JSON（转义避免字符串注入）
    const fieldsJson = JSON.stringify(fields)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
    html = html.replace('/*__ZSCX_FIELDS__*/', fieldsJson)

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    console.error('[office-plugin index] error', e)
    return new NextResponse(`<html><body style="font-family:sans-serif;padding:16px;color:#b91c1c">字段插件加载失败：${e.message}</body></html>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
    })
  }
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