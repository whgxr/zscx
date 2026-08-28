import { NextRequest, NextResponse } from 'next/server'
import { getObjectBuffer } from '@/lib/storage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// 简单扩展名 -> Content-Type 映射（供内联预览与下载）
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain', '.csv': 'text/csv',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.zip': 'application/zip', '.rar': 'application/x-rar-compressed', '.7z': 'application/x-7z-compressed',
  '.json': 'application/json',
}

function getMime(key: string): string {
  const ext = '.' + (key.split('.').pop() || '').toLowerCase()
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}

/**
 * 上传文件的代理下载/预览路由。
 * 用户上传的文件/图片存于对象存储（MinIO），通过本路由按对象 key 读取返回。
 * 与原先 public/uploads 静态访问（无需鉴权）保持一致，便于图片内联展示。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { key: string[] } }
) {
  try {
    const key = Array.isArray(params.key) ? decodeURIComponent(params.key.join('/')) : ''
    if (!key) {
      return NextResponse.json({ message: '缺少文件标识' }, { status: 400 })
    }

    let buffer: Buffer
    try {
      buffer = await getObjectBuffer(key)
    } catch (e: any) {
      const code = e?.code || ''
      if (code === 'NoSuchKey' || code === 'NotFound') {
        return NextResponse.json({ message: '文件不存在' }, { status: 404 })
      }
      console.error('Proxy read object error:', e)
      return NextResponse.json({ message: '读取文件失败' }, { status: 500 })
    }

    const mime = getMime(key)
    const displayName = key.split('/').pop() || 'file'
    const isImage = mime.startsWith('image/') || mime === 'application/pdf'

    const headers = new Headers()
    headers.set('Content-Type', mime)
    headers.set('Content-Length', buffer.length.toString())
    headers.set('Content-Disposition', `${isImage ? 'inline' : 'attachment'}; filename="${encodeURIComponent(displayName)}"`)
    headers.set('Cache-Control', 'private, max-age=31536000, immutable')

    return new NextResponse(new Uint8Array(buffer), { headers })
  } catch (error) {
    console.error('Proxy file error:', error)
    return NextResponse.json({ message: '文件访问失败' }, { status: 500 })
  }
}