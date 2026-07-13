import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { generateId } from '@/lib/utils'
import { AttachmentType } from '@prisma/client'

export const runtime = 'nodejs'

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv',
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.zip', '.rar', '.7z',
]

function getMagicBytes(buffer: Buffer, length: number = 8): string {
  return buffer.slice(0, length).toString('hex').toLowerCase()
}

function verifyMagicBytes(buffer: Buffer, ext: string): boolean {
  const extLower = ext.toLowerCase()
  const magic = getMagicBytes(buffer)

  if (['.jpg', '.jpeg'].includes(extLower)) return magic.startsWith('ffd8ff')
  if (extLower === '.png') return magic.startsWith('89504e47')
  if (extLower === '.gif') return magic.startsWith('47494638')
  if (extLower === '.bmp') return magic.startsWith('424d')
  if (extLower === '.pdf') return magic.startsWith('25504446')
  if (['.doc', '.xls', '.ppt'].includes(extLower)) return magic.startsWith('d0cf11e0')
  if (['.docx', '.xlsx', '.pptx', '.zip'].includes(extLower)) return magic.startsWith('504b0304')
  if (extLower === '.mp4') return magic.includes('66747970')
  if (['.mp3', '.mpeg'].includes(extLower)) return magic.startsWith('494433') || magic.startsWith('fff')
  if (extLower === '.rar') return magic.startsWith('52617221')
  if (extLower === '.7z') return magic.startsWith('377abcaf')

  return true
}

function getAttachmentType(mimeType: string, ext: string): AttachmentType {
  const extLower = ext.toLowerCase()
  if (mimeType.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'].includes(extLower)) {
    return AttachmentType.IMAGE
  }
  return AttachmentType.FILE
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tableName: string; recordId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const dataTable = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
    })
    if (!dataTable) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    const recordId = parseInt(params.recordId)
    if (isNaN(recordId)) {
      return NextResponse.json({ message: '无效的记录ID' }, { status: 400 })
    }

    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
    })
    if (!record || record.tableId !== dataTable.id) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const displayName = formData.get('displayName') as string
    const type = formData.get('type') as string

    if (!file) {
      return NextResponse.json({ message: '请选择文件' }, { status: 400 })
    }

    if (!displayName || !displayName.trim()) {
      return NextResponse.json({ message: '请填写附件名称' }, { status: 400 })
    }

    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760')
    if (file.size > maxSize) {
      return NextResponse.json({ message: `文件大小不能超过 ${maxSize / 1024 / 1024}MB` }, { status: 400 })
    }

    const ext = path.extname(file.name).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ message: '不支持的文件类型' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (!verifyMagicBytes(buffer, ext)) {
      return NextResponse.json({ message: '文件内容与扩展名不符' }, { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'record-attachments')
    const dateDir = new Date().toISOString().slice(0, 7).replace('-', '/')
    const fullDir = path.join(uploadDir, dateDir)

    try {
      await mkdir(fullDir, { recursive: true })
    } catch (e) {}

    const fileName = `${generateId()}${ext}`
    const filePath = path.join(fullDir, fileName)
    const relativePath = `/uploads/record-attachments/${dateDir}/${fileName}`.replace(/\\/g, '/')

    await writeFile(filePath, buffer)

    const attachmentType = type === 'image' ? AttachmentType.IMAGE : getAttachmentType(file.type, ext)

    const attachment = await prisma.recordAttachment.create({
      data: {
        tableId: dataTable.id,
        recordId: recordId,
        type: attachmentType,
        displayName: displayName.trim(),
        originalName: file.name,
        fileName,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.type,
        uploadedBy: user.id,
      },
      include: {
        uploader: {
          select: { id: true, username: true, realName: true, phone: true },
        },
      },
    })

    return NextResponse.json({ attachment })
  } catch (error) {
    console.error('Attachment upload error:', error)
    return NextResponse.json({ message: '上传失败' }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string; recordId: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const dataTable = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
    })
    if (!dataTable) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    const recordId = parseInt(params.recordId)
    if (isNaN(recordId)) {
      return NextResponse.json({ message: '无效的记录ID' }, { status: 400 })
    }

    const attachments = await prisma.recordAttachment.findMany({
      where: {
        tableId: dataTable.id,
        recordId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: { id: true, username: true, realName: true, phone: true },
        },
      },
    })

    return NextResponse.json({ attachments })
  } catch (error) {
    console.error('Get attachments error:', error)
    return NextResponse.json({ message: '获取附件列表失败' }, { status: 500 })
  }
}
