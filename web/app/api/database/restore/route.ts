import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'

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

// 安全检查：防止路径穿越，允许系统备份和上传的备份文件名
function isValidFileName(fileName: string): boolean {
  // 允许字母、数字、下划线、连字符，必须以 .sql.gz 或 .sql 结尾
  return /^[a-zA-Z0-9_\-\.]+\.sql(\.gz)?$/.test(fileName) && !fileName.includes('..')
}

// 从服务器备份文件恢复
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    // 只有超级系统管理员(ADMIN)可以操作
    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以执行数据库恢复' }, { status: 403 })
    }

    const body = await req.json()
    const { fileName } = body

    if (!fileName) {
      return NextResponse.json({ message: '请指定要恢复的备份文件' }, { status: 400 })
    }

    if (!isValidFileName(fileName)) {
      return NextResponse.json({ message: '无效的备份文件名' }, { status: 400 })
    }

    const filePath = path.join(BACKUP_DIR, fileName)

    try {
      await fs.access(filePath)
    } catch {
      return NextResponse.json({ message: '备份文件不存在' }, { status: 404 })
    }

    const dbInfo = parseDbUrl()

    // 如果是 .sql.gz，先用 Node.js zlib 解压为临时 .sql 文件（跨平台，不依赖 gunzip）
    let sqlFilePath = filePath
    const isGzip = fileName.endsWith('.gz')

    if (isGzip) {
      sqlFilePath = filePath.replace(/\.gz$/, '')
      try {
        await pipeline(
          createReadStream(filePath),
          createGunzip(),
          createWriteStream(sqlFilePath)
        )
      } catch (gzipError: any) {
        console.error('gunzip error:', gzipError)
        return NextResponse.json(
          { message: '解压备份文件失败：' + (gzipError.message || '未知错误') },
          { status: 500 }
        )
      }
    }

    // 使用 mysql 命令恢复（Windows 下重定向符 < 需要用 cmd /c 包裹）
    const isWin = process.platform === 'win32'
    const restoreCmd = isWin
      ? `cmd /c "mysql -h ${dbInfo.host} -P ${dbInfo.port} -u ${dbInfo.user} -p'${dbInfo.password}' ${dbInfo.database} < "${sqlFilePath}""`
      : `mysql -h ${dbInfo.host} -P ${dbInfo.port} -u ${dbInfo.user} -p'${dbInfo.password}' ${dbInfo.database} < "${sqlFilePath}"`

    try {
      await execAsync(restoreCmd, { timeout: 600000, maxBuffer: 1024 * 1024 * 100 })
    } catch (restoreError: any) {
      console.error('mysql restore error:', restoreError)
      // 清理临时解压文件
      if (isGzip) {
        try { await fs.unlink(sqlFilePath) } catch {}
      }
      return NextResponse.json(
        { message: '数据库恢复失败：' + (restoreError.message || '执行mysql命令失败') },
        { status: 500 }
      )
    }

    // 清理临时解压文件
    if (isGzip) {
      try { await fs.unlink(sqlFilePath) } catch {}
    }

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DATABASE_RESTORE',
        module: 'SYSTEM',
        detail: { fileName } as any,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Database restore error:', error)
    return NextResponse.json(
      { message: '数据库恢复失败：' + (error.message || '未知错误') },
      { status: 500 }
    )
  }
}
