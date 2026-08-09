import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getCurrentUser } from '@/lib/auth'
import type { ExportType } from '@prisma/client'

/**
 * GET  /api/export/templates?tableId=X&type=WORD|FORM|...  列出可用于当前表的模板
 * POST /api/export/templates  创建空模板（Word/Excel）
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const tableId = searchParams.get('tableId') ? Number(searchParams.get('tableId')) : undefined
    const type = searchParams.get('type') as ExportType | undefined
    const category = searchParams.get('category') ?? undefined
    const where: any = {}
    if (tableId) where.OR = [{ tableId }, { isShared: true }]
    if (type) where.type = type
    if (category) where.category = { contains: category }
    const rows = await prisma.exportTemplate.findMany({
      where, orderBy: { id: 'desc' },
      include: { table: { select: { id: true, label: true, name: true, categoryId: true } } },
    })
    return NextResponse.json({ ok: true, data: rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageTables) return NextResponse.json({ ok: false, error: '无权限' }, { status: 403 })
    const body = await req.json()
    const tableId = Number(body.tableId)
    if (!tableId) return NextResponse.json({ ok: false, error: '缺少 tableId' }, { status: 400 })
    const type: ExportType = (body.type as any) ?? 'WORD'
    const created = await prisma.exportTemplate.create({
      data: {
        tableId,
        name: body.name ?? (type === 'WORD' ? '新建 Word 文书模板' : '新建 Excel 模板'),
        type,
        description: body.description ?? null,
        category: body.category ?? (type === 'WORD' ? 'PRINT,LEVY_AGREEMENT' : 'EXPORT'),
        paperSize: body.paperSize ?? 'A4',
        orientation: body.orientation ?? 'portrait',
        outputFormat: body.outputFormat ?? 'DOCX',
        config: {},
        documentConfig: type === 'WORD' ? ({ blocks: [] } as any) : Prisma.JsonNull,
        createdBy: user.id,
      }
    })
    return NextResponse.json({ ok: true, data: { id: created.id } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '失败' }, { status: 500 })
  }
}
