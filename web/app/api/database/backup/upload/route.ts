import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

// 安全检查：文件名只允许字母、数字、下划线、连字符、点
function isSafeFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9_\-\.]+\.sql(\.gz)?$/.test(fileName) && !fileName.includes('..')
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    // 只有超级系统管理员(ADMIN)可以操作
    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以上传备份文件' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ message: '请选择要上传的备份文件' }, { status: 400 })
    }

    // 文件大小限制：500MB
    const maxSize = 500 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ message: '文件大小不能超过500MB' }, { status: 400 })
    }

    // 安全检查文件名
    const originalName = file.name
    if (!isSafeFileName(originalName)) {
      return NextResponse.json({
        message: '无效的文件名，只允许 .sql 或 .sql.gz 文件，且文件名只能包含字母、数字、下划线、连字符'
      }, { status: 400 })
    }

    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    // 如果文件名已存在，添加时间戳后缀
    let fileName = originalName
    let filePath = path.join(BACKUP_DIR, fileName)
    try {
      await fs.access(filePath)
      // 文件已存在，重命名
      const ext = fileName.endsWith('.sql.gz') ? '.sql.gz' : '.sql'
      const baseName = fileName.replace(/\.sql(\.gz)?$/, '')
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      fileName = `${baseName}_uploaded_${dateStr}${ext}`
      filePath = path.join(BACKUP_DIR, fileName)
    } catch {
      // 文件不存在，使用原名
    }

    // 写入文件
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    await fs.writeFile(filePath, buffer)

    const stats = await fs.stat(filePath)

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DATABASE_BACKUP_UPLOAD',
        module: 'SYSTEM',
        detail: { fileName, fileSize: stats.size, originalName } as any,
      },
    })

    return NextResponse.json({
      success: true,
      backup: {
        fileName,
        fileSize: stats.size,
        createdAt: stats.mtime.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Upload backup error:', error)
    return NextResponse.json(
      { message: '上传备份文件失败：' + (error.message || '未知错误') },
      { status: 500 }
    )
  }
}
