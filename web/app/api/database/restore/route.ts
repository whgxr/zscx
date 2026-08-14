import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const BACKUP_DIR = path.join(process.cwd(), 'backups')

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

function isValidFileName(fileName: string): boolean {
  return /^[a-zA-Z0-9_\-\.]+\.sql(\.gz)?$/.test(fileName) && !fileName.includes('..')
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

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
    const isGzip = fileName.endsWith('.gz')
    
    let sqlFilePath = filePath
    let tempFile: string | null = null
    
    if (isGzip) {
      const zlib = require('zlib')
      const compressed = await fs.readFile(filePath)
      const decompressed = zlib.gunzipSync(compressed)
      tempFile = path.join(BACKUP_DIR, '_restore_' + Date.now() + '.sql')
      await fs.writeFile(tempFile, decompressed)
      sqlFilePath = tempFile
    }

    const fileContent = await fs.readFile(sqlFilePath, 'utf8')
    const dangerousPatterns = [
      { pattern: /\bDROP\s+DATABASE\b/gi, name: 'DROP DATABASE' },
    ]
    for (const { pattern, name } of dangerousPatterns) {
      const matches = fileContent.match(pattern)
      if (matches && matches.length > 0) {
        if (tempFile) await fs.unlink(tempFile).catch(() => {})
        return NextResponse.json(
          { message: '数据库恢复失败：检测到危险SQL语句 - ' + name },
          { status: 400 }
        )
      }
    }

    try {
      const mysqlCmd = 'mysql -h ' + dbInfo.host + ' -P ' + dbInfo.port + ' -u ' + dbInfo.user + ' -p' + dbInfo.password + ' ' + dbInfo.database + ' --default-character-set=utf8mb4 --skip-ssl'

      console.log('[Restore] 开始恢复: ' + fileName)
      console.log('[Restore] 执行: ' + mysqlCmd + ' < ' + sqlFilePath)

      await execFileAsync('sh', [
        '-c',
        mysqlCmd + ' < "' + sqlFilePath + '"'
      ], {
        timeout: 300000,
        maxBuffer: 50 * 1024 * 1024,
      })

      console.log('[Restore] 数据库恢复成功')

      // 还原可能重置了数据库，审计日志写入失败不应导致恢复被误报为失败
      try {
        await prisma.operationLog.create({
          data: {
            userId: user.id,
            action: 'DATABASE_RESTORE',
            module: 'SYSTEM',
            detail: { fileName },
          },
        })
      } catch (logError: any) {
        console.warn('[Restore] 审计日志写入失败（可忽略）:', logError.message || logError)
      }

      return NextResponse.json({ success: true })
    } catch (execError: any) {
      const stderr = (execError.stderr || '').toString()
      console.error('[Restore] mysql 执行失败:', execError.message || execError)
      console.error('stderr:', stderr.substring(0, 500))
      return NextResponse.json(
        { message: '数据库恢复失败：' + (stderr || execError.message || '未知错误') },
        { status: 500 }
      )
    } finally {
      if (tempFile) {
        await fs.unlink(tempFile).catch(() => {})
      }
    }
  } catch (error: any) {
    console.error('Database restore error:', error.message || error)
    return NextResponse.json(
      { message: '数据库恢复失败：' + (error.message || '未知错误') },
      { status: 500 }
    )
  }
}
