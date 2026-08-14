import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { createGzip } from 'zlib'
import { pipeline } from 'stream/promises'

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

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以执行数据库备份' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const dbInfo = parseDbUrl()
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = 'db_backup_' + dateStr + '.sql.gz'
    const filePath = path.join(BACKUP_DIR, fileName)

    return new Promise<Response>((resolve) => {
      const gzip = createGzip()
      const output = createWriteStream(filePath)

      const child = spawn('mysqldump', [
        '-h', dbInfo.host,
        '-P', dbInfo.port,
        '-u', dbInfo.user,
        '--single-transaction',
        '--routines',
        '--triggers',
        '--quick',
        '--skip-ssl',
        dbInfo.database,
      ], {
        env: { ...process.env, MYSQL_PWD: dbInfo.password },
        timeout: 300000,
      })

      let stderrData = ''

      child.stderr?.on('data', (data) => {
        stderrData += data.toString()
      })

      child.stdout?.pipe(gzip)
      gzip.pipe(output)

      output.on('finish', async () => {
        try {
          const stats = await fs.stat(filePath)

          await prisma.operationLog.create({
            data: {
              userId: user.id,
              action: 'DATABASE_BACKUP',
              module: 'SYSTEM',
              detail: { fileName, fileSize: stats.size } as any,
            },
          })

          resolve(NextResponse.json({
            success: true,
            backup: {
              fileName,
              fileSize: stats.size,
              createdAt: stats.mtime.toISOString(),
            },
          }))
        } catch (logError) {
          resolve(NextResponse.json({
            success: true,
            backup: { fileName, fileSize: 0, createdAt: new Date().toISOString() },
          }))
        }
      })

      child.on('error', (err) => {
        resolve(NextResponse.json(
          { message: '数据库备份失败：' + err.message },
          { status: 500 }
        ))
      })

      child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          resolve(NextResponse.json(
            { message: '数据库备份失败：mysqldump 退出码 ' + code + ' - ' + stderrData.substring(0, 300) },
            { status: 500 }
          ))
        }
      })
    })
  } catch (error: any) {
    console.error('Database backup error:', error)
    return NextResponse.json(
      { message: '数据库备份失败：' + (error.message || '未知错误') },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    if (user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '只有超级系统管理员可以查看备份列表' }, { status: 403 })
    }

    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const files = await fs.readdir(BACKUP_DIR)
    const backups = []

    for (const fileName of files) {
      if (!fileName.endsWith('.sql.gz') && !fileName.endsWith('.sql')) continue
      const filePath = path.join(BACKUP_DIR, fileName)
      const stats = await fs.stat(filePath)
      backups.push({
        fileName,
        fileSize: stats.size,
        createdAt: stats.mtime.toISOString(),
      })
    }

    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({ backups })
  } catch (error: any) {
    console.error('List backups error:', error)
    return NextResponse.json({ message: '获取备份列表失败' }, { status: 500 })
  }
}
