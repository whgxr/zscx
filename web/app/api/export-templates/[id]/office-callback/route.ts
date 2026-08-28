import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyCallbackToken } from '@/lib/office-config'
import { saveObject, buildObjectKey } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * POST /api/export-templates/[id]/office-callback
 * ONLYOFFICE Document Server 保存回调。
 * status: 1=编辑中 2=可保存 3=保存出错 4=无改动关闭 6=强制保存 7=强制保存出错
 * 对 status 2/6 且带 url 时，下载编辑后的文件 → 存 MinIO → 更新模板文件 key。
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const raw = await req.text()
  let body: any = {}
  try { body = JSON.parse(raw) } catch { /* noop */ }

  // 验签：DS 会将回调体用密钥签名放入 X-Doceditor-Token（或 query token）
  const token = req.headers.get('x-token') || req.headers.get('authorization') || ''
  const qtoken = req.nextUrl.searchParams.get('token') || ''
  if (token && !verifyCallbackToken(token)) {
    return NextResponse.json({ error: 1, msg: 'token invalid' }, { status: 401 })
  }
  if (!token && qtoken && !verifyCallbackToken(qtoken)) {
    return NextResponse.json({ error: 1, msg: 'token invalid' }, { status: 401 })
  }

  const templateId = parseInt(params.id)
  const status = body.status
  const key = body.key
  const url = body.url
  const kind = String(key || '').includes('cell') ? 'cell' : 'word'

  // 编辑后文件落库
  if ((status === 2 || status === 6) && url) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer())
        const ext = kind === 'cell' ? 'xlsx' : 'docx'
        const objKey = buildObjectKey(`templates/${templateId}`, `template-${Date.now()}.${ext}`)
        await saveObject(objKey, buf, res.headers.get('content-type') || undefined)
        // 更新模板文件 key（旧 key 由 cleanup 任务回收，此处覆盖引用即可）
        await prisma.exportTemplate.update({
          where: { id: templateId },
          data: kind === 'cell' ? { spreadsheetFileKey: objKey } : { documentFileKey: objKey },
        })
        console.log(`[office-callback] tpl=${templateId} kind=${kind} saved=${objKey} (${buf.length}B)`)
      }
    } catch (e: any) {
      console.error('[office-callback] save fail', e.message)
    }
  }

  if (status === 6) {
    return NextResponse.json({ error: 0, lastsave: new Date().toISOString() })
  }
  return NextResponse.json({ error: 0 })
}