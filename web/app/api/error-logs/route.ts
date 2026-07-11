import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const level = searchParams.get('level') || ''
    const module = searchParams.get('module') || ''
    const searchTerm = searchParams.get('search') || ''

    const where: any = {}
    if (level) where.level = level
    if (module) where.module = module
    if (searchTerm) {
      where.OR = [
        { message: { contains: searchTerm } },
        { stackTrace: { contains: searchTerm } },
        { requestUrl: { contains: searchTerm } },
      ]
    }

    const [logs, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.errorLog.count({ where }),
    ])

    const userIds = [...new Set(logs.map(log => log.userId).filter(Boolean))]
    const users = userIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: userIds as number[] } },
      select: { id: true, username: true, realName: true },
    }) : []

    const userMap = new Map(users.map(u => [u.id, u]))

    const logsWithUser = logs.map(log => ({
      ...log,
      user: log.userId ? userMap.get(log.userId) || null : null,
    }))

    return NextResponse.json({
      logs: logsWithUser,
      total,
      page,
      pageSize,
    })
  } catch (error) {
    console.error('Get error logs error:', error)
    return NextResponse.json({ message: '获取错误日志失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const body = await req.json()
    const {
      level = 'ERROR',
      module,
      action,
      message,
      stackTrace,
      requestUrl,
      requestMethod,
      requestParams,
      tableId,
      recordId,
    } = body

    const sanitizedParams = sanitizeSensitiveData(requestParams)

    const errorLog = await prisma.errorLog.create({
      data: {
        userId: user.id,
        level,
        module: module || 'UNKNOWN',
        action: action || 'UNKNOWN',
        message: message?.slice(0, 2000),
        stackTrace: stackTrace?.slice(0, 5000),
        requestUrl: requestUrl?.slice(0, 500),
        requestMethod: requestMethod?.slice(0, 10),
        requestParams: sanitizedParams || null,
        tableId: tableId || null,
        recordId: recordId || null,
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('remote-address') || null,
        userAgent: (req.headers.get('user-agent') || '').slice(0, 191) || null,
      },
    })

    return NextResponse.json({ success: true, errorLog }, { status: 201 })
  } catch (error) {
    console.error('Create error log error:', error)
    return NextResponse.json({ message: '创建错误日志失败' }, { status: 500 })
  }
}

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /credential/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
]

function sanitizeSensitiveData(data: any): any {
  if (!data) return data
  if (typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(sanitizeSensitiveData)

  const sanitized: Record<string, any> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
      sanitized[key] = '***REDACTED***'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeSensitiveData(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || user.role?.name !== 'ADMIN') {
      return NextResponse.json({ message: '无权限' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const days = parseInt(searchParams.get('days') || '30')

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    await prisma.errorLog.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Clear error logs error:', error)
    return NextResponse.json({ message: '清理错误日志失败' }, { status: 500 })
  }
}