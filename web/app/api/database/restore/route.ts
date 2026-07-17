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

// 安全检查：防止路径穿越，允许系统备份和上传的备份文件名
function isValidFileName(fileName: string): boolean {
  // 允许字母、数字、下划线、连字符，必须以 .sql.gz 或 .sql 结尾
  return /^[a-zA-Z0-9_\-\.]+\.sql(\.gz)?$/.test(fileName) && !fileName.includes('..')
}

// 通用 SQL 语法转换：处理高版本 MySQL（5.6+）/PostgreSQL 向低版本 MySQL 5.5 兼容
function convertSqlForLegacyMysql(sql: string): string {
  let result = sql

  // ========== PostgreSQL 特定语法 ==========
  result = result.replace(/\bSERIAL\b/g, 'INT AUTO_INCREMENT')
  result = result.replace(/\bBIGSERIAL\b/g, 'BIGINT AUTO_INCREMENT')
  result = result.replace(/\bSMALLSERIAL\b/g, 'SMALLINT AUTO_INCREMENT')
  result = result.replace(/\bON CONFLICT[^;]*;/g, ';')
  result = result.replace(/\bCREATE EXTENSION[^;]*;/g, '')
  result = result.replace(/\bALTER TABLE[^;]*OWNER TO[^;]*;/g, '')
  result = result.replace(/\bSET search_path[^;]*;/g, '')
  result = result.replace(/\bGEN_RANDOM_UUID\(\)/g, 'UUID()')
  result = result.replace(/\buuid_generate_v4\(\)/g, 'UUID()')
  result = result.replace(/\bUSING btree\b/g, '')
  // 只删除 PostgreSQL DROP TABLE 中的 CASCADE，不删除 MySQL 外键的 ON DELETE CASCADE
  result = result.replace(/\bDROP TABLE IF EXISTS[^;]*CASCADE;/gi, (match) => match.replace(/\bCASCADE\b/gi, ''))
  result = result.replace(/\bDEFERRABLE INITIALLY DEFERRED\b/g, '')
  result = result.replace(/\b::text\b/g, '').replace(/\b::integer\b/g, '').replace(/\b::bigint\b/g, '').replace(/\b::jsonb?\b/g, '')

  // ========== MySQL 高版本→低版本兼容性转换（针对 MySQL 5.5） ==========

  // 关键修复：datetime(N) 和 timestamp(N) 精度在 MySQL 5.5 不支持
  // 改为 datetime 和 timestamp
  result = result.replace(/`datetime`\(\d+\)/gi, '`datetime`')
  result = result.replace(/`timestamp`\(\d+\)/gi, '`timestamp`')
  result = result.replace(/(\s)datetime\(\d+\)/gi, '$1datetime')
  result = result.replace(/(\s)timestamp\(\d+\)/gi, '$1timestamp')

  // 关键修复：去掉 CURRENT_TIMESTAMP(N) 中的精度参数
  // 必须先处理带精度的，再处理不带精度的（避免重复匹配）
  result = result.replace(/CURRENT_TIMESTAMP\(\d+\)/g, 'CURRENT_TIMESTAMP')

  // MySQL 5.5 不支持 DATETIME 列使用 CURRENT_TIMESTAMP 作为默认值（仅支持 TIMESTAMP）
  // 将 `xxx` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP 改为 TIMESTAMP 类型
  // 匹配：字段名 datetime [NOT NULL] DEFAULT CURRENT_TIMESTAMP
  result = result.replace(
    /(`[^`]+`\s+)datetime(\s+(?:NOT\s+)?NULL\s+DEFAULT\s+CURRENT_TIMESTAMP)/gi,
    '$1timestamp$2'
  )
  result = result.replace(
    /(`[^`]+`\s+)datetime(\s+DEFAULT\s+CURRENT_TIMESTAMP)/gi,
    '$1timestamp$2'
  )

  // 移除 utf8mb4_0900_ai_ci 这种 MySQL 8 才支持的排序规则
  result = result.replace(/COLLATE\s+utf8mb4_0900_ai_ci/gi, 'COLLATE utf8mb4_unicode_ci')

  // 移除 MySQL 8 才支持的 CHARACTER SET utf8mb4 之外的高级字符集
  // 保留 utf8mb4

  // 移除 CHECK 约束（MySQL 5.5 不支持，但 8.0+ 支持）
  // 注意：要小心处理，避免误删
  // 这里只处理行尾的 CHECK 约束
  // result = result.replace(/,\s*CHECK\s*\([^)]+\)\s*,/gi, ',')
  // 暂不处理 CHECK，避免误删数据

  // 移除 DEFAULT (expression) 语法（MySQL 5.5 不支持表达式默认值，8.0+ 才支持）
  // 这里我们的备份都是 CURRENT_TIMESTAMP 形式，应该已经被处理了

  // 移除 MySQL 8 的 COMMENT 在列上的语法（保留为列注释）
  // 暂不处理

  // utf8mb4_0900_ai_ci 是 MySQL 8 排序规则，需要降级
  result = result.replace(/utf8mb4_0900_ai_ci/g, 'utf8mb4_unicode_ci')

  // ========== 关键修复：MySQL 5.5 不支持 JSON 类型（5.7+ 才支持） ==========
  // 将 json 类型改为 LONGTEXT（MySQL 5.5 兼容）
  result = result.replace(/(\s)json(\s+(?:NOT\s+)?NULL(?:\s+DEFAULT\s+NULL)?)/gi, '$1longtext$2')
  result = result.replace(/(\s)json(\s+DEFAULT\s+NULL)/gi, '$1longtext$2')
  result = result.replace(/(\s)json(\s*,)/gi, '$1longtext$2')
  result = result.replace(/(\s)json(\s*$)/gi, '$1longtext$2')
  result = result.replace(/(\s)json(\s*DEFAULT\s+[^,)]+)/gi, '$1longtext$2')

  // ========== 关键修复：MySQL 5.5 每张表只能有一个 TIMESTAMP DEFAULT CURRENT_TIMESTAMP ==========
  // 逐行处理，在每张 CREATE TABLE 中只保留第一个 DEFAULT CURRENT_TIMESTAMP
  const lines = result.split('\n')
  let inCreateTable = false
  let hasTimestampDefault = false
  const processedLines = lines.map(line => {
    if (/CREATE TABLE\s+`/i.test(line)) {
      inCreateTable = true
      hasTimestampDefault = false
      return line
    }
    if (inCreateTable && /^\s*\)\s*/.test(line)) {
      inCreateTable = false
      return line
    }
    if (inCreateTable && /DEFAULT\s+CURRENT_TIMESTAMP/i.test(line)) {
      if (hasTimestampDefault) {
        // 移除第二个及以后的 DEFAULT CURRENT_TIMESTAMP 和 ON UPDATE CURRENT_TIMESTAMP
        return line
          .replace(/\s*DEFAULT\s+CURRENT_TIMESTAMP(?:\(\d+\))?/gi, '')
          .replace(/\s*ON\s+UPDATE\s+CURRENT_TIMESTAMP(?:\(\d+\))?/gi, '')
      }
      hasTimestampDefault = true
    }
    return line
  })

  return processedLines.join('\n')
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
    const tempFilesToClean: string[] = []

    if (isGzip) {
      sqlFilePath = filePath.replace(/\.gz$/, '')
      tempFilesToClean.push(sqlFilePath)
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

    // 根据数据库类型选择恢复命令
    const isWin = process.platform === 'win32'
    let restoreCmd: string

    if (dbInfo.type === 'postgres') {
      restoreCmd = isWin
        ? `cmd /c "set PGPASSWORD=${dbInfo.password} && psql -h ${dbInfo.host} -p ${dbInfo.port} -U ${dbInfo.user} -d ${dbInfo.database} -f "${sqlFilePath}""`
        : `PGPASSWORD=${dbInfo.password} psql -h ${dbInfo.host} -p ${dbInfo.port} -U ${dbInfo.user} -d ${dbInfo.database} -f "${sqlFilePath}"`
    } else {
      // MySQL：高版本→低版本兼容性转换（MySQL 5.7+ → 5.5）
      const sqlContent = await fs.readFile(sqlFilePath, 'utf8')
      const convertedSql = convertSqlForLegacyMysql(sqlContent)
      const convertedFilePath = sqlFilePath + '.converted'
      tempFilesToClean.push(convertedFilePath)
      await fs.writeFile(convertedFilePath, convertedSql, 'utf8')
      sqlFilePath = convertedFilePath

      restoreCmd = isWin
        ? `cmd /c "mysql -h ${dbInfo.host} -P ${dbInfo.port} -u ${dbInfo.user} -p'${dbInfo.password}' --skip-ssl ${dbInfo.database} < "${sqlFilePath}""`
        : `mysql -h ${dbInfo.host} -P ${dbInfo.port} -u ${dbInfo.user} -p'${dbInfo.password}' --skip-ssl ${dbInfo.database} < "${sqlFilePath}"`
    }

    try {
      await execAsync(restoreCmd, { timeout: 600000, maxBuffer: 1024 * 1024 * 100 })
    } catch (restoreError: any) {
      console.error('restore error:', restoreError)
      // 清理临时文件
      for (const tempFile of tempFilesToClean) {
        try { await fs.unlink(tempFile) } catch {}
      }
      return NextResponse.json(
        { message: '数据库恢复失败：' + (restoreError.message || '执行恢复命令失败') },
        { status: 500 }
      )
    }

    // 清理临时文件
    for (const tempFile of tempFilesToClean) {
      try { await fs.unlink(tempFile) } catch {}
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
