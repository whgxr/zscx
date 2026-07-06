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
    const body = await req.json()
    const {
      userId,
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
      ipAddress,
      userAgent,
    } = body

    const errorLog = await prisma.errorLog.create({
      data: {
        userId: userId || null,
        level,
        module: module || 'UNKNOWN',
        action: action || 'UNKNOWN',
        message,
        stackTrace,
        requestUrl,
        requestMethod,
        requestParams: requestParams || null,
        tableId: tableId || null,
        recordId: recordId || null,
        ipAddress,
        userAgent,
      },
    })

    return NextResponse.json({ success: true, errorLog }, { status: 201 })
  } catch (error) {
    console.error('Create error log error:', error)
    return NextResponse.json({ message: '创建错误日志失败' }, { status: 500 })
  }
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