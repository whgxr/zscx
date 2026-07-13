import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

const BACKUP_DIR = path.join(process.cwd(), 'backups')

// 解析 DATABASE_URL 获取连接信息
function parseDbUrl() {
  const url = new URL(process.env.DATABASE_URL || '')
  return {
    host: url.hostname,
    port: url.port || '3306',
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  }
}

// 创建备份
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    // 只有超级系统管理员(ADMIN)可以操作
    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以执行数据库备份' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { includeUploads } = body || {}

    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const dbInfo = parseDbUrl()
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `db_backup_${dateStr}.sql.gz`
    const filePath = path.join(BACKUP_DIR, fileName)

    // 使用 mysqldump 备份数据库，通过管道压缩
    const dumpCmd = `mysqldump -h ${dbInfo.host} -P ${dbInfo.port} -u ${dbInfo.user} -p'${dbInfo.password}' --single-transaction --routines --triggers --quick ${dbInfo.database} | gzip > "${filePath}"`

    try {
      await execAsync(dumpCmd, { timeout: 300000, maxBuffer: 1024 * 1024 * 100 })
    } catch (dumpError: any) {
      console.error('mysqldump error:', dumpError)
      return NextResponse.json(
        { message: '数据库备份失败：' + (dumpError.message || '执行mysqldump命令失败') },
        { status: 500 }
      )
    }

    // 获取文件大小
    const stats = await fs.stat(filePath)

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DATABASE_BACKUP',
        module: 'SYSTEM',
        detail: { fileName, fileSize: stats.size, includeUploads } as any,
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
    console.error('Database backup error:', error)
    return NextResponse.json(
      { message: '数据库备份失败：' + (error.message || '未知错误') },
      { status: 500 }
    )
  }
}

// 获取备份列表
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以查看备份列表' }, { status: 403 })
    }

    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const files = await fs.readdir(BACKUP_DIR)
    const backups = []

    for (const fileName of files) {
      // 显示系统备份(.sql.gz)和上传的备份文件(.sql / .sql.gz)
      if (!fileName.endsWith('.sql.gz') && !fileName.endsWith('.sql')) continue
      const filePath = path.join(BACKUP_DIR, fileName)
      const stats = await fs.stat(filePath)
      backups.push({
        fileName,
        fileSize: stats.size,
        createdAt: stats.mtime.toISOString(),
      })
    }

    // 按创建时间降序排列
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ backups })
  } catch (error: any) {
    console.error('List backups error:', error)
    return NextResponse.json({ message: '获取备份列表失败' }, { status: 500 })
  }
}
