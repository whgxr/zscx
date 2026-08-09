import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { renderDocxToBuffer, type DocxPageSettings } from '@/lib/docx-renderer'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

function realIp(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? null
}
function deepParse(data: any): any {
  if (data == null) return data
  if (typeof data === 'string') {
    try { return JSON.parse(data) } catch { return data }
  }
  return data
}

const USE_LIBREOFFICE = process.env.LIBREOFFICE_BIN || ''

/**
 * POST /api/export/[tableName]/docx
 *   body: { templateId, recordId, action?: 'download' | 'printPdf' | 'preview', related? }
 *   M3-T5: 生成 .docx；可选通过 libreoffice-convert 输出 PDF 用于打印预览
 *   M3-T8: 每次生成写入 OperationLog (DOC_GENERATE / PRINT / DOWNLOAD / PREVIEW)
 */
export async function POST(req: NextRequest, { params }: { params: { tableName: string } }) {
  const t0 = Date.now()
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ ok: false, error: '未登录' }, { status: 401 })
    const body = await req.json()
    const tableName = params.tableName
    const templateId = Number(body.templateId)
    const recordId = Number(body.recordId)
    const action: 'download' | 'printPdf' | 'preview' = body.action ?? 'preview'

    if (!templateId || !recordId) return NextResponse.json({ ok: false, error: '缺少必填：templateId, recordId' }, { status: 400 })
    const table = await prisma.dataTable.findFirst({ where: { name: tableName } })
    if (!table) return NextResponse.json({ ok: false, error: '表不存在' }, { status: 404 })
    const record = await prisma.dataRecord.findUnique({ where: { id: recordId } })
    if (!record || record.tableId !== table.id) return NextResponse.json({ ok: false, error: '记录不存在' }, { status: 404 })
    const tpl = await prisma.exportTemplate.findUnique({ where: { id: templateId } })
    if (!tpl) return NextResponse.json({ ok: false, error: '模板不存在' }, { status: 404 })
    if (tpl.type !== 'WORD') return NextResponse.json({ ok: false, error: '该模板不是 WORD 类型' }, { status: 400 })

    const docCfg: any = tpl.documentConfig ?? { blocks: [] }
    const blocks = (docCfg.blocks ?? []) as any[]
    const page: DocxPageSettings = {
      paperSize: (tpl.paperSize as any) ?? docCfg.paper?.paperSize,
      orientation: (tpl.orientation as any) ?? docCfg.paper?.orientation,
      marginsCm: docCfg.paper?.marginsCm,
    }
    const recordData = deepParse(record.data) ?? {}
    const related = body.related ?? null

    const buf = await renderDocxToBuffer(blocks, { record: recordData, related, title: tpl.name, page })
    const ms = Date.now() - t0
    const filename = `${tpl.name}_R${recordId}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}`

    // M3-T8 审计
    const opAction =
      action === 'printPdf' ? 'DOC_PRINT' :
      action === 'download' ? 'DOC_DOWNLOAD' : 'DOC_PREVIEW'
    try {
      await prisma.operationLog.create({
        data: {
          userId: user.id, action: opAction, module: 'EXPORT_DOC',
          tableId: table.id, recordId: record.id,
          detail: { templateId, templateName: tpl.name, action, format: 'DOCX', renderMs: ms } as any,
          ipAddress: realIp(req) ?? undefined,
          userAgent: req.headers.get('user-agent') ?? undefined,
        }
      })
    } catch (_) { /* ignore */ }

    // .docx 下载路径：返回 base64 让前端触发下载（更简单、跨 OS）
    const wantPdf = action === 'printPdf' && !!USE_LIBREOFFICE
    if (wantPdf) {
      try {
        const pdf = await convertDocxToPdfViaLibre(buf)
        const base64 = pdf.toString('base64')
        return NextResponse.json({ ok: true, data: { format: 'PDF', base64, filename: `${filename}.pdf`, mime: 'application/pdf', renderMs: Date.now() - t0 } })
      } catch (e: any) {
        // 失败降级为 DOCX
        return NextResponse.json({ ok: true, data: { format: 'DOCX', base64: buf.toString('base64'), filename: `${filename}.docx`, mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pdfFailed: e.message, renderMs: Date.now() - t0 } })
      }
    }
    return NextResponse.json({
      ok: true,
      data: {
        format: action === 'printPdf' ? 'DOCX' : 'DOCX',
        base64: buf.toString('base64'),
        filename: `${filename}.docx`,
        mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        renderMs: Date.now() - t0,
      }
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? '生成失败', renderMs: Date.now() - t0 }, { status: 500 })
  }
}

async function convertDocxToPdfViaLibre(docxBuffer: Buffer): Promise<Buffer> {
  // 可选：若安装 libreoffice 且设置了路径，则走转换
  // 本项目已安装 libreoffice-convert，这里做一个保底实现（有则调，没有抛错）
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const libre = require('libreoffice-convert') as any
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zscx-docx-'))
    const inp = path.join(tmpDir, 'a.docx')
    fs.writeFileSync(inp, docxBuffer)
    const outBuf: Buffer = await new Promise((res, rej) => {
      libre.convert(docxBuffer, '.pdf', undefined, (err: any, r: Buffer) => {
        if (err) return rej(err)
        res(r)
      })
    })
    try { fs.rmSync(tmpDir, { recursive: true }) } catch { /* ignore */ }
    return outBuf
  } catch (e: any) {
    e.message = `libreoffice convert 失败：${e.message}（安装 LibreOffice 并在环境变量 LIBREOFFICE_BIN 配置 soffice 路径可启用 PDF 打印）`
    throw e
  }
}
