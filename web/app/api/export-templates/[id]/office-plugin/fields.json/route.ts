import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/export-templates/[id]/office-plugin/fields.json
 * 返回「字段插入」插件的字段列表。插件 iframe 与业务系统同源(:777)，脚本运行时同源 fetch 本接口，
 * 无需依赖 HTML 内联注入（避免 ONLYOFFICE 插件沙箱改写 HTML 导致的 SyntaxError / 无字段问题）。
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const templateId = parseInt(params.id)
  let fields: { name: string; label: string }[] = []
  try {
    const tpl = await prisma.exportTemplate.findUnique({
      where: { id: templateId },
      include: { table: { include: { fields: { orderBy: { id: 'asc' } } } } },
    })
    fields = (tpl?.table?.fields || []).map((f: any) => ({ name: f.name, label: f.label || f.name }))
  } catch (e: any) {
    console.error('[office-plugin fields] error', e)
  }
  return new NextResponse(JSON.stringify({ fields }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS', 'Cache-Control': 'no-store' },
  })
}