import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { saveObject, buildObjectKey } from '@/lib/storage'
import { renderRichDocxToBuffer } from '@/lib/docx-renderer'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 初始 Word 模板内容（RichContent，含一个示例占位符段落，供用户在 ONLYOFFICE 中继续编辑） */
function defaultDocContent() {
  return {
    blocks: [
      { type: 'paragraph', runs: [{ text: '征收工作文书（模板）', bold: true, fontSize: 18 }], style: { align: 'center' } },
      { type: 'paragraph', runs: [{ text: '被征收人：{{owner_name}}' }], style: {} },
      { type: 'paragraph', runs: [{ text: '房屋坐落：{{house_address}}' }], style: {} },
      { type: 'paragraph', runs: [{ text: '建筑面积：{{area}} 平方米' }], style: {} },
      { type: 'paragraph', runs: [{ text: '' }], style: {} },
    ],
  }
}

/**
 * POST /api/export-templates/[id]/office-file?kind=word|cell
 * 为模板生成初始模板文件（docx/xlsx）→ 存 MinIO → 关联 documentFileKey/spreadsheetFileKey。
 * 幂等：若该 kind 已有文件则直接返回现有 key。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ message: '未登录' }, { status: 401 })

    const templateId = parseInt(params.id)
    const kind = req.nextUrl.searchParams.get('kind') === 'cell' ? 'cell' : 'word'
    const tpl = await prisma.exportTemplate.findUnique({ where: { id: templateId } })
    if (!tpl) return NextResponse.json({ message: '模板不存在' }, { status: 404 })

    const existingKey = kind === 'cell' ? tpl.spreadsheetFileKey : tpl.documentFileKey
    if (existingKey) {
      return NextResponse.json({ key: existingKey, existed: true })
    }

    let buf: Buffer
    let ext: string
    let contentType: string
    if (kind === 'cell') {
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Sheet1')
      ws.getCell('A1').value = '被征收人'
      ws.getCell('B1').value = '{{owner_name}}'
      ws.getCell('A2').value = '房屋坐落'
      ws.getCell('B2').value = '{{house_address}}'
      ws.getCell('A3').value = '建筑面积'
      ws.getCell('B3').value = '{{area}}'
      for (const r of [1, 2, 3]) ws.getCell(`A${r}`).font = { bold: true }
      buf = Buffer.from(await wb.xlsx.writeBuffer())
      ext = 'xlsx'
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    } else {
      buf = await renderRichDocxToBuffer(defaultDocContent(), {
        record: {}, related: null, title: tpl.name || '模板',
        page: { paperSize: tpl.paperSize || 'A4', orientation: tpl.orientation || 'portrait' },
      })
      ext = 'docx'
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }

    const objKey = buildObjectKey(`templates/${templateId}`, `template-${Date.now()}.${ext}`)
    await saveObject(objKey, buf, contentType)

    await prisma.exportTemplate.update({
      where: { id: templateId },
      data: kind === 'cell' ? { spreadsheetFileKey: objKey } : { documentFileKey: objKey },
    })

    return NextResponse.json({ key: objKey, existed: false })
  } catch (e: any) {
    console.error('[office-file] error', e)
    return NextResponse.json({ message: e.message || '初始化失败' }, { status: 500 })
  }
}