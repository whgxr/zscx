import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { RecordStatus, FieldType } from '@prisma/client'

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
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
      if (!permission || !permission.canView) {
        return NextResponse.json({ message: '无权限查看此数据' }, { status: 403 })
      }
    }

    const recordId = parseInt(params.id)
    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
      include: {
        creator: { select: { id: true, realName: true, username: true } },
        files: true,
      },
    })

    if (!record || record.tableId !== table.id) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    return NextResponse.json({ record })
  } catch (error) {
    console.error('Get record error:', error)
    return NextResponse.json({ message: '获取数据失败' }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    const table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: { fields: true },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canEdit) {
        return NextResponse.json({ message: '无权限编辑此数据' }, { status: 403 })
      }
    }

    if (user.role?.name === 'VIEWER') {
      return NextResponse.json({ message: '查看员无法编辑数据' }, { status: 403 })
    }

    const recordId = parseInt(params.id)
    const existingRecord = await prisma.dataRecord.findUnique({
      where: { id: recordId },
    })

    if (!existingRecord || existingRecord.tableId !== table.id) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    const body = await req.json()
    const { data, status } = body

    if (status !== undefined && status !== null) {
      if (!Object.values(RecordStatus).includes(status)) {
        return NextResponse.json({ message: '无效的状态值' }, { status: 400 })
      }
    }

    const fieldMap = new Map(table.fields.map(f => [f.name, f]))
    const sanitizedData: Record<string, any> = {}

    if (data && typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        const field = fieldMap.get(key)
        if (!field) continue
        if (value === null || value === undefined) {
          sanitizedData[key] = null
          continue
        }
        try {
          sanitizedData[key] = convertFieldValue(value, field)
        } catch (e: any) {
          return NextResponse.json({ message: e.message || `字段"${field.label}"值无效` }, { status: 400 })
        }
      }
    }

    const updateData: any = {
      data: sanitizedData,
      updatedBy: user.id,
    }
    if (status !== undefined && status !== null) updateData.status = status

    const record = await prisma.dataRecord.update({
      where: { id: recordId },
      data: updateData,
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId: record.id,
        detail: body,
      },
    })

    return NextResponse.json({ record })
  } catch (error) {
    console.error('Update record error:', error)
    return NextResponse.json({ message: '更新数据失败' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { tableName: string; id: string } }
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

    if (user.role?.name !== 'ADMIN' && user.role?.name !== 'MANAGER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canDelete) {
        return NextResponse.json({ message: '无权限删除此数据' }, { status: 403 })
      }
    }

    const recordId = parseInt(params.id)
    const record = await prisma.dataRecord.findUnique({
      where: { id: recordId },
    })

    if (!record || record.tableId !== table.id) {
      return NextResponse.json({ message: '记录不存在' }, { status: 404 })
    }

    await prisma.uploadedFile.deleteMany({ where: { recordId, tableId: table.id } })

    await prisma.dataRecord.delete({
      where: { id: recordId, tableId: table.id },
    })

    await prisma.operationLog.create({
      data: {
        userId: user.id,
        action: 'DELETE_RECORD',
        module: 'DATA',
        tableId: table.id,
        recordId,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete record error:', error)
    return NextResponse.json({ message: '删除数据失败' }, { status: 500 })
  }
}

function convertFieldValue(value: any, field: any): any {
  const strValue = String(value).trim()

  switch (field.type) {
    case FieldType.NUMBER:
    case FieldType.INTEGER:
    case FieldType.FLOAT:
    case FieldType.MONEY: {
      const num = parseFloat(strValue)
      if (isNaN(num)) {
        throw new Error(`字段"${field.label}"的值不是有效的数字`)
      }
      if (field.type === FieldType.INTEGER && !Number.isInteger(num)) {
        throw new Error(`字段"${field.label}"的值必须是整数`)
      }
      return num
    }

    case FieldType.DATE:
    case FieldType.DATETIME: {
      const date = new Date(strValue)
      if (isNaN(date.getTime())) {
        throw new Error(`字段"${field.label}"的值不是有效的日期格式`)
      }
      return field.type === FieldType.DATE
        ? date.toISOString().split('T')[0]
        : date.toISOString()
    }

    case FieldType.SWITCH:
    case FieldType.CHECKBOX: {
      const lower = strValue.toLowerCase()
      if (['是', 'true', '1', 'yes', 'on'].includes(lower)) return true
      if (['否', 'false', '0', 'no', 'off'].includes(lower)) return false
      throw new Error(`字段"${field.label}"的值不是有效的布尔值`)
    }

    case FieldType.MULTISELECT: {
      if (Array.isArray(value)) return value
      return strValue
        .split(/[,，、;；]/)
        .map((s: string) => s.trim())
        .filter((s: string) => s)
    }

    case FieldType.SELECT:
    case FieldType.RADIO:
    case FieldType.TEXT:
    case FieldType.TEXTAREA:
    case FieldType.PHONE:
    case FieldType.EMAIL:
    case FieldType.IDCARD:
    case FieldType.ADDRESS:
    case FieldType.RICHTEXT:
    case FieldType.UPLOAD_IMAGE:
    case FieldType.UPLOAD_FILE:
    case FieldType.RELATION:
    case FieldType.DETAIL_TABLE:
    default:
      return strValue
  }
}
