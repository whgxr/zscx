import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { generateId } from '@/lib/utils'
import { FileType } from '@prisma/client'

export const runtime = 'nodejs'

function getFileType(mimeType: string): FileType {
  if (mimeType.startsWith('image/')) return FileType.IMAGE
  if (mimeType.startsWith('video/')) return FileType.VIDEO
  if (mimeType.startsWith('audio/')) return FileType.AUDIO
  if (mimeType.includes('pdf') || mimeType.includes('word') || mimeType.includes('excel') || mimeType.includes('document')) {
    return FileType.DOCUMENT
  }
  return FileType.OTHER
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

    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    const dateDir = new Date().toISOString().slice(0, 7).replace('-', '/')
    const fullDir = path.join(uploadDir, dateDir)

    try {
      await mkdir(fullDir, { recursive: true })
    } catch (e) {
      // 目录已存在
    }

    const ext = path.extname(file.name) || ''
    const fileName = `${generateId()}${ext}`
    const filePath = path.join(fullDir, fileName)
    const relativePath = `/uploads/${dateDir}/${fileName}`.replace(/\\/g, '/')

    const buffer = Buffer.from(await file.arrayBuffer())
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

