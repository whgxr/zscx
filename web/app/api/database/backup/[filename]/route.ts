import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

// 安全检查：防止路径穿越，允许系统备份和上传的备份文件名
function isValidFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9_\-\.]+\.sql(\.gz)?$/.test(fileName) && !fileName.includes('..')
}

// 下载备份文件
export async function GET(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以下载备份' }, { status: 403 })
    }

    const fileName = decodeURIComponent(params.filename)
    if (!isValidFileName(fileName)) {
      return NextResponse.json({ message: '无效的文件名' }, { status: 400 })
    }

    const filePath = path.join(BACKUP_DIR, fileName)
    
    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ message: '备份文件不存在' }, { status: 404 })
    }

    const fileBuffer = await fs.readFile(filePath)

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DATABASE_BACKUP_DOWNLOAD',
        module: 'SYSTEM',
        detail: { fileName } as any,
      },
    })

    // 使用 RFC 5987 标准格式处理中文文件名
    const encodedFileName = encodeURIComponent(fileName)
    const contentType = fileName.endsWith('.gz') ? 'application/gzip' : 'application/sql'
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodedFileName}`,
        'Content-Length': fileBuffer.byteLength.toString(),
      },
    })
  } catch (error: any) {
    console.error('Download backup error:', error)
    return NextResponse.json({ message: '下载备份失败' }, { status: 500 })
  }
}

// 删除备份文件
export async function DELETE(
  req: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以删除备份' }, { status: 403 })
    }

    const fileName = decodeURIComponent(params.filename)
    if (!isValidFileName(fileName)) {
      return NextResponse.json({ message: '无效的文件名' }, { status: 400 })
    }

    const filePath = path.join(BACKUP_DIR, fileName)

    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ message: '备份文件不存在' }, { status: 404 })
    }

    await fs.unlink(filePath)

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DATABASE_BACKUP_DELETE',
        module: 'SYSTEM',
        detail: { fileName } as any,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete backup error:', error)
    return NextResponse.json({ message: '删除备份失败' }, { status: 500 })
  }
}
