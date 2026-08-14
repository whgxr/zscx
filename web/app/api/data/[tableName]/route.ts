import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { moduleOfTable, stripNonEditableFields } from '@/lib/levy-sync-detector'
import { tryLevySaveAutoTrigger } from '@/lib/approval-service'
import mysql from 'mysql2/promise'

const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'zscx-mysql',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'zscx',
  password: process.env.DB_PASSWORD || 'zscx123456',
  database: process.env.DB_NAME || 'zscx',
  waitForConnections: true,
  connectionLimit: 5,
})

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: {
        fields: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canView) {
        return NextResponse.json({ message: '无权限查看此表数据' }, { status: 403 })
      }
    }

    if (search) {
      const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
      const searchPattern = `%${escapedSearch}%`

      const statusClause = status ? 'AND r.status = ?' : ''
      const queryParams: any[] = [table.id]
      if (status) queryParams.push(status)
      queryParams.push(searchPattern)

      const countParams: any[] = [table.id]
      if (status) countParams.push(status)
      countParams.push(searchPattern)

      const [recordsRaw, totalRaw] = await Promise.all([
        dbPool.query(
          `SELECT 
            r.id, r.tableId, r.data, r.status, r.createdAt, r.updatedAt, r.createdBy, r.updatedBy,
            u.realName AS creator_realName, u.username AS creator_username
          FROM DataRecord r
          LEFT JOIN \`User\` u ON r.createdBy = u.id
          WHERE r.tableId = ?
          ${statusClause}
          AND CAST(r.data AS CHAR) LIKE ?
          ORDER BY r.createdAt DESC
          LIMIT ? OFFSET ?`,
          [...queryParams, pageSize, (page - 1) * pageSize]
        ),
        dbPool.query(
          `SELECT COUNT(*) AS total
          FROM DataRecord r
          WHERE r.tableId = ?
          ${statusClause}
          AND CAST(r.data AS CHAR) LIKE ?`,
          countParams
        ),
      ])

      const records = (recordsRaw[0] as any[]).map((row: any) => ({
        id: row.id,
        tableId: row.tableId,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : Buffer.isBuffer(row.data) ? JSON.parse(row.data.toString()) : row.data,
        status: row.status,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
        creator: row.creator_realName || row.creator_username
          ? { id: row.createdBy, realName: row.creator_realName, username: row.creator_username }
          : null,
      }))

      const total = Number((totalRaw[0] as any[])[0]?.total) || 0

      return NextResponse.json({
        records,
        total,
        page,
        pageSize,
        fields: table.fields,
        table: {
          id: table.id,
          name: table.name,
          label: table.label,
        },
      })
    }

    const where: any = { tableId: table.id }

    if (status) {
      where.status = status
    }

    const [records, total] = await Promise.all([
      prisma.dataRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          creator: {
            select: { id: true, realName: true, username: true },
          },
        },
      }),
      prisma.dataRecord.count({ where }),
    ])

    return NextResponse.json({
      records,
      total,
      page,
      pageSize,
      fields: table.fields,
      table: {
        id: table.id,
        name: table.name,
        label: table.label,
      },
    })
  } catch (error) {
    console.error('Get records error:', error)
    return NextResponse.json({ message: '获取数据失败' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: {
        fields: true,
        category: { select: { module: true } },
      },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canCreate) {
        return NextResponse.json({ message: '无权限添加数据' }, { status: 403 })
      }
    }

    if (user.role?.name === 'VIEWER') {
      return NextResponse.json({ message: '查看员无法添加数据' }, { status: 403 })
    }

    const body = await req.json()
    let { data, status = 'DRAFT' } = body

    // v1.2.2+ 可填写阶段：忽略当前模块不允许填写的字段提交值
    const module = moduleOfTable((table.category as any)?.module)
    if (data && typeof data === 'object') {
      data = stripNonEditableFields(table.fields, data, module)
    }

    const record = await prisma.dataRecord.create({
      data: {
        tableId: table.id,
        data,
        status,
        createdBy: user.id,
        updatedBy: user.id,
      } as any,
    })

    // v1.2.2+：同步改为完全手动触发（不点同步按钮不同步），此处仅记录操作日志
    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'CREATE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId: record.id,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      },
    })

    // v1.2.2+ M2-T4: 若是征收模块 + 绑定了 LEVY_SAVE 触发流程，新建时也自动发起审批
    const levyTrigger = await tryLevySaveAutoTrigger({
      table: { id: table.id, categoryId: table.categoryId, approvalTriggerConfig: table.approvalTriggerConfig, featureFlags: table.featureFlags },
      recordId: record.id, initiatorId: user.id, ip: ipAddress, ua: userAgent,
    })

    return NextResponse.json({ record, levyTrigger: !levyTrigger.skipped ? { instanceId: (levyTrigger as any).instanceId, matched: (levyTrigger as any).matched } : null })
  } catch (error) {
    console.error('Create record error:', error)
    return NextResponse.json({ message: '创建数据失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canDelete) {
        return NextResponse.json({ message: '无权限删除数据' }, { status: 403 })
      }
    }

    const body = await req.json()
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ message: '请选择要删除的记录' }, { status: 400 })
    }

    const ipAddress = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0].trim() || null
    const userAgent = req.headers.get('user-agent') || null

    await prisma.dataRecord.deleteMany({
      where: {
        id: { in: ids },
        tableId: table.id,
      },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'BATCH_DELETE_RECORDS',
        module: 'DATA',
        tableId: table.id,
        detail: { count: ids.length, deletedIds: ids } as any,
        ipAddress: ipAddress ?? undefined,
        userAgent: userAgent ?? undefined,
      },
    })

    return NextResponse.json({ message: '批量删除成功' })
  } catch (error) {
    console.error('Batch delete error:', error)
    return NextResponse.json({ message: '批量删除失败' }, { status: 500 })
  }
}
