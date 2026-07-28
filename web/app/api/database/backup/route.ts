import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { exec } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { createReadStream, createWriteStream } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'

const BACKUP_DIR = path.join(process.cwd(), 'backups')

// 解析 DATABASE_URL 获取连接信息
function parseDbUrl() {
  const url = new URL(process.env.DATABASE_URL || '')
  const protocol = url.protocol.replace(':', '')
  const isPostgres = protocol === 'postgres' || protocol === 'postgresql'
  return {
    host: url.hostname,
    port: url.port || (isPostgres ? '5432' : '3306'),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    type: isPostgres ? 'postgres' : 'mysql' as const,
  }
}

// 安全转义 shell 参数，防止命令注入
// 注意：双引号内不转义反斜杠。在 POSIX /bin/sh 双引号中，\ 后跟非特殊字符（$, `, ", \, 换行）以外的字符时，反斜杠会原样保留；
// 在 Windows cmd.exe 双引号内，反斜杠完全无特殊含义。若对 \ 二次转义，会破坏 Windows 路径（如 D:\backups\test.sql → D:\\backups\\test.sql），导致 mysql/psql 找不到文件。
function escapeShellArg(arg: string): string {
  // 对于敏感参数，使用环境变量传递而非命令行参数
  // 这里只转义文件路径等非敏感参数
  if (/^[a-zA-Z0-9_\-\.\/\\]+$/.test(arg)) {
    return arg // 只包含安全字符，无需转义
  }
  // 其他情况用双引号包裹并转义特殊字符（不转义 \，见上方注释）
  return `"${arg.replace(/(["$`!])/g, '\\$1')}"`
}

// 使用 exec 执行命令并返回 stdout（不使用 shell 重定向，避免 Windows 环境问题）
// 安全增强：密码通过环境变量传递，避免命令行暴露和注入风险
function execWithOutput(cmd: string, env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, {
      timeout: 300000,
      maxBuffer: 1024 * 1024 * 100,
      env: { ...process.env, ...env } // 合并环境变量
    })
    let stdout = ''
    let stderr = ''
    
    child.stdout?.on('data', (data) => {
      stdout += data
    })
    
    child.stderr?.on('data', (data) => {
      stderr += data
    })
    
    child.on('error', (err) => {
      reject(new Error(`Command error: ${err.message}`))
    })
    
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code}: ${stderr}`))
      } else {
        resolve(stdout)
      }
    })
  })
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
    const sqlFilePath = filePath.replace(/\.gz$/, '')

    // 根据数据库类型选择备份命令（密码通过环境变量传递，避免命令行注入）
    let dumpCmd: string
    let dumpEnv: Record<string, string> = {}
    
    if (dbInfo.type === 'postgres') {
      dumpCmd = `pg_dump -h ${escapeShellArg(dbInfo.host)} -p ${escapeShellArg(dbInfo.port)} -U ${escapeShellArg(dbInfo.user)} -d ${escapeShellArg(dbInfo.database)} -F p`
      dumpEnv = { PGPASSWORD: dbInfo.password }
    } else {
      dumpCmd = `mysqldump -h ${escapeShellArg(dbInfo.host)} -P ${escapeShellArg(dbInfo.port)} -u ${escapeShellArg(dbInfo.user)} --single-transaction --routines --triggers --quick --skip-ssl ${escapeShellArg(dbInfo.database)}`
      dumpEnv = { MYSQL_PWD: dbInfo.password }
    }

    let dumpOutput: string
    try {
      dumpOutput = await execWithOutput(dumpCmd, dumpEnv)

      // 关键验证：防止空备份静默成功
      if (!dumpOutput || dumpOutput.trim().length === 0) {
        console.error('dump output is empty, possible connection failure')
        return NextResponse.json(
          { message: '数据库备份失败：备份输出为空，请检查数据库连接' },
          { status: 500 }
        )
      }
    } catch (dumpError: any) {
      console.error('dump error:', dumpError)
      return NextResponse.json(
        { message: '数据库备份失败：' + (dumpError.message || '执行备份命令失败') },
        { status: 500 }
      )
    }

    // 将备份内容写入临时 .sql 文件
    try {
      await fs.writeFile(sqlFilePath, dumpOutput, 'utf8')
    } catch (writeError: any) {
      console.error('Write sql file error:', writeError)
      return NextResponse.json(
        { message: '写入备份文件失败：' + (writeError.message || '未知错误') },
        { status: 500 }
      )
    }

    // 使用 Node.js zlib 压缩为 .sql.gz（跨平台，不依赖 gzip 命令）
    try {
      await pipeline(
        createReadStream(sqlFilePath),
        createGzip(),
        createWriteStream(filePath)
      )
    } catch (gzipError: any) {
      console.error('gzip error:', gzipError)
      try { await fs.unlink(sqlFilePath) } catch {}
      return NextResponse.json(
        { message: '压缩备份文件失败：' + (gzipError.message || '未知错误') },
        { status: 500 }
      )
    }

    // 清理临时 .sql 文件
    try { await fs.unlink(sqlFilePath) } catch {}

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
