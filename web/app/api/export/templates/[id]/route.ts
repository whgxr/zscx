import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

/**
 * GET    /api/export/templates/[id]        加载模板（Word/Excel）
 * PUT    /api/export/templates/[id]        保存 Word/Excel 模板配置
 * DELETE /api/export/templates/[id]        删除
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const id = Number(params.id)
    const tpl = await prisma.exportTemplate.findUnique({
      where: { id },
      include: { table: { select: { id: true, label: true, name: true, fields: true } } }
    })
    if (!tpl) return NextResponse.json({ ok: false, error: '模板不存在' }, { status: 404 })
    return NextResponse.json({ ok: true, data: tpl })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '失败' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageTables) return NextResponse.json({ ok: false, error: '无权限' }, { status: 403 })
    const id = Number(params.id)
    const body = await req.json()
    const updated = await prisma.exportTemplate.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        description: body.description ?? undefined,
        category: body.category ?? undefined,
        paperSize: body.paperSize ?? undefined,
        orientation: body.orientation ?? undefined,
        outputFormat: body.outputFormat ?? undefined,
        isDefault: body.isDefault ?? undefined,
        config: body.config !== undefined ? (body.config as any) : undefined,
        documentConfig: body.documentConfig !== undefined ? (body.documentConfig as any) : undefined,
      }
    })
    return NextResponse.json({ ok: true, data: updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '失败' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user || !user.role?.canManageTables) return NextResponse.json({ ok: false, error: '无权限' }, { status: 403 })
    const id = Number(params.id)
    await prisma.exportTemplate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '失败' }, { status: 500 })
  }
}
