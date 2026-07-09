import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

export const runtime = 'nodejs'

async function getPdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    const data = new Uint8Array(buffer)
    const pdf = await pdfjsLib.getDocument(data).promise
    const count = pdf.numPages
    pdf.destroy()
    return count
  } catch (e) {
    console.error('getPdfPageCount error:', e)
    return 1
  }
}

async function renderPdfPage(buffer: Buffer, pageNum: number): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default
    return await sharp(buffer, { page: pageNum - 1, density: 150 })
      .png()
      .toBuffer()
  } catch (e) {
    console.error(`renderPdfPage page ${pageNum} error:`, e)
    throw e
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json({ message: '无效的附件ID' }, { status: 400 })
    }

    const attachment = await prisma.recordAttachment.findUnique({
      where: { id },
    })

    if (!attachment) {
      return NextResponse.json({ message: '附件不存在' }, { status: 404 })
    }

    const filePath = path.join(process.cwd(), 'public', attachment.filePath)
    let fileBuffer: Buffer

    try {
      fileBuffer = await readFile(filePath)
    } catch (e) {
      return NextResponse.json({ message: '文件不存在' }, { status: 404 })
    }

    const mimeType = attachment.mimeType || ''
    const isImage = mimeType.startsWith('image/')
    const isPdf = mimeType === 'application/pdf' || attachment.originalName?.toLowerCase().endsWith('.pdf')

    const pages: { dataUrl: string }[] = []

    if (isImage) {
      const base64 = fileBuffer.toString('base64')
      const dataUrl = `data:${mimeType};base64,${base64}`
      pages.push({ dataUrl })
    } else if (isPdf) {
      try {
        const pageCount = await getPdfPageCount(fileBuffer)
        for (let i = 1; i <= pageCount; i++) {
          try {
            const pageBuffer = await renderPdfPage(fileBuffer, i)
            const base64 = pageBuffer.toString('base64')
            pages.push({ dataUrl: `data:image/png;base64,${base64}` })
          } catch (e) {
            console.error(`Error rendering PDF page ${i}:`, e)
          }
        }
      } catch (e) {
        console.error('Error processing PDF:', e)
        return NextResponse.json({ message: 'PDF转换失败' }, { status: 500 })
      }
    }

    return NextResponse.json({ pages, displayName: attachment.displayName })
  } catch (error) {
    console.error('Preview attachment error:', error)
    return NextResponse.json({ message: '预览失败' }, { status: 500 })
  }
}