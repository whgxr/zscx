import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { generateId } from '@/lib/utils'
import { FileType } from '@prisma/client'

export const runtime = 'nodejs'

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv',
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  '.mp3', '.wav', '.ogg', '.flac', '.aac',
  '.zip', '.rar', '.7z',
]

const MAGIC_BYTES: Record<string, string[]> = {
  image: [
    'ffd8ff',
    '89504e47',
    '47494638',
    '424d',
    '52494646',
    '3c3f786d',
  ],
  pdf: [
    '25504446',
  ],
  document: [
    'd0cf11e0',
    '504b0304',
  ],
  video: [
    '0000001866747970',
    '0000002066747970',
    '52494646',
  ],
  audio: [
    '494433',
    'fff1',
    'fff9',
    '52494646',
    '4f676753',
  ],
  archive: [
    '504b0304',
    '52617221',
    '377abcaf',
  ],
}

function getFileType(mimeType: string): FileType {
  if (mimeType.startsWith('image/')) return FileType.IMAGE
  if (mimeType.startsWith('video/')) return FileType.VIDEO
  if (mimeType.startsWith('audio/')) return FileType.AUDIO
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('document')) {
    return FileType.DOCUMENT
  }
  return FileType.OTHER
}

function getMagicBytes(buffer: Buffer, length: number = 8): string {
  return buffer.slice(0, length).toString('hex').toLowerCase()
}

function verifyMagicBytes(buffer: Buffer, ext: string): boolean {
  const extLower = ext.toLowerCase()
  const magic = getMagicBytes(buffer)

  if (['.jpg', '.jpeg'].includes(extLower)) {
    return magic.startsWith('ffd8ff')
  }
  if (extLower === '.png') {
    return magic.startsWith('89504e47')
  }
  if (extLower === '.gif') {
    return magic.startsWith('47494638')
  }
  if (extLower === '.bmp') {
    return magic.startsWith('424d')
  }
  if (extLower === '.pdf') {
    return magic.startsWith('25504446')
  }
  if (['.doc', '.xls', '.ppt'].includes(extLower)) {
    return magic.startsWith('d0cf11e0')
  }
  if (['.docx', '.xlsx', '.pptx', '.zip'].includes(extLower)) {
    return magic.startsWith('504b0304')
  }
  if (extLower === '.mp4') {
    return magic.includes('66747970')
  }
  if (['.mp3', '.mpeg'].includes(extLower)) {
    return magic.startsWith('494433') || magic.startsWith('fff')
  }
  if (extLower === '.rar') {
    return magic.startsWith('52617221')
  }
  if (extLower === '.7z') {
    return magic.startsWith('377abcaf')
  }
  if (extLower === '.svg') {
    const header = buffer.slice(0, 200).toString('utf-8').toLowerCase()
    return header.includes('<svg')
  }

  return true
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const tableId = formData.get('tableId') as string
    const fieldName = formData.get('fieldName') as string

    if (!file) {
      return NextResponse.json({ message: '请选择文件' }, { status: 400 })
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

    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    const dateDir = new Date().toISOString().slice(0, 7).replace('-', '/')
    const fullDir = path.join(uploadDir, dateDir)

    try {
      await mkdir(fullDir, { recursive: true })
    } catch (e) {
      // 目录已存在
    }

    const fileName = `${generateId()}${ext}`
    const filePath = path.join(fullDir, fileName)
    const relativePath = `/uploads/${dateDir}/${fileName}`.replace(/\\/g, '/')

    await writeFile(filePath, buffer)

    const fileType = getFileType(file.type)

    const savedFile = await prisma.uploadedFile.create({
      data: {
        tableId: tableId ? parseInt(tableId) : undefined,
        fieldName: fieldName || undefined,
        originalName: file.name,
        fileName,
        filePath: relativePath,
        fileSize: file.size,
        mimeType: file.type,
        fileType,
        uploadedBy: user.id,
      },
    })

    return NextResponse.json({
      file: savedFile,
      url: relativePath,
    })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ message: '上传失败' }, { status: 500 })
  }
}

