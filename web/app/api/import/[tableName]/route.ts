import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { FieldType, RecordStatus } from '@prisma/client'

export const runtime = 'nodejs'

interface ImportResult {
  success: number
  failed: number
  total: number
  errors: { row: number; message: string }[]
}

const statusTextMap: Record<string, RecordStatus> = {
  '草稿': RecordStatus.DRAFT,
  '已提交': RecordStatus.SUBMITTED,
  '已审核': RecordStatus.REVIEWED,
  '已驳回': RecordStatus.REJECTED,
  '已归档': RecordStatus.ARCHIVED,
  'DRAFT': RecordStatus.DRAFT,
  'SUBMITTED': RecordStatus.SUBMITTED,
  'REVIEWED': RecordStatus.REVIEWED,
  'REJECTED': RecordStatus.REJECTED,
  'ARCHIVED': RecordStatus.ARCHIVED,
}

export async function POST(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  let user: any = null
  let table: any = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    const isAdmin = user.role?.name === 'ADMIN'
    const isManager = user.role?.name === 'MANAGER'

    if (!isAdmin && !isManager) {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canImport) {
        return NextResponse.json({ message: '无权限导入数据' }, { status: 403 })
      }
    }

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ message: '请选择Excel文件' }, { status: 400 })
    }

    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760')
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: `文件大小不能超过 ${maxSize / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer()) as any
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    const worksheet = workbook.worksheets[0]
    if (!worksheet) {
      return NextResponse.json({ message: 'Excel文件中没有工作表' }, { status: 400 })
    }

    const fields = table.fields.filter((f: any) => !f.isSystem)
    const headerRow = worksheet.getRow(1)
    const headerValues = headerRow.values as string[]

    const fieldMap: Record<number, any> = {}
    let idColumnIndex = -1
    let statusColumnIndex = -1

    for (let i = 1; i < headerValues.length; i++) {
      const header = headerValues[i]?.toString().trim()
      if (!header) continue

      if (header === 'ID' || header === 'id') {
        idColumnIndex = i
        continue
      }

      if (header === '状态' || header === 'status') {
        statusColumnIndex = i
        continue
      }

      const field = fields.find(
        (f: any) =>
          f.label === header ||
          f.name === header ||
          f.name.toLowerCase() === header.toLowerCase()
      )

      if (field) {
        fieldMap[i] = field
      }
    }

    if (Object.keys(fieldMap).length === 0) {
      return NextResponse.json(
        { message: '未找到匹配的字段列，请检查Excel表头是否正确' },
        { status: 400 }
      )
    }

    const result: ImportResult = {
      success: 0,
      failed: 0,
      total: 0,
      errors: [],
    }

    const recordsToCreate: any[] = []
    const recordsToUpdate: { id: number; data: any; status?: RecordStatus }[] = []

    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum)
      if (!row || row.cellCount === 0) continue

      const rowValues = row.values as any[]
      const isEmptyRow = rowValues.every((v, i) => i === 0 || !v || v.toString().trim() === '')
      if (isEmptyRow) continue

      result.total++

      try {
        const data: Record<string, any> = {}
        let recordId: number | null = null
        let recordStatus: RecordStatus | null = null

        if (idColumnIndex > 0) {
          const idVal = rowValues[idColumnIndex]
          if (idVal) {
            recordId = parseInt(idVal.toString())
            if (isNaN(recordId)) {
              throw new Error(`ID格式错误: ${idVal}`)
            }
          }
        }

        if (statusColumnIndex > 0) {
          const statusVal = rowValues[statusColumnIndex]?.toString().trim()
          if (statusVal) {
            recordStatus = statusTextMap[statusVal] || null
          }
        }

        for (const [colIndexStr, field] of Object.entries(fieldMap)) {
          const colIndex = parseInt(colIndexStr)
          const value = rowValues[colIndex]

          if (value === undefined || value === null || value === '') {
            if (field.required && !recordId) {
              throw new Error(`字段"${field.label}"不能为空`)
            }
            data[field.name] = field.defaultValue || null
            continue
          }

          data[field.name] = convertValue(value, field)
        }

        if (recordId) {
          recordsToUpdate.push({ id: recordId, data, status: recordStatus || undefined })
        } else {
          recordsToCreate.push({
            tableId: table.id,
            data,
            status: recordStatus || RecordStatus.DRAFT,
            createdBy: user.id,
          })
        }

        result.success++
      } catch (error: any) {
        result.failed++
        result.errors.push({
          row: rowNum,
          message: error.message || '未知错误',
        })
      }
    }

    if (recordsToCreate.length > 0) {
      await prisma.dataRecord.createMany({
        data: recordsToCreate,
      })
    }

    if (recordsToUpdate.length > 0) {
      for (const record of recordsToUpdate) {
        const existing = await prisma.dataRecord.findUnique({
          where: { id: record.id },
        })
        if (existing && existing.tableId === table.id) {
          const updateData: any = {
            data: { ...(existing.data as object), ...record.data },
            updatedBy: user.id,
          }
          if (record.status) {
            updateData.status = record.status
          }
          await prisma.dataRecord.update({
            where: { id: record.id },
            data: updateData,
          })
        } else {
          result.failed++
          result.success--
          result.errors.push({
            row: -1,
            message: `记录ID ${record.id} 不存在或不属于当前表`,
          })
        }
      }
    }

    try {
      await prisma.operationLog.create({
        data: {
          userId: user.id,
          action: 'IMPORT_EXCEL',
          module: 'IMPORT',
          tableId: table.id,
          detail: {
            fileName: file.name,
            total: result.total,
            success: result.success,
            failed: result.failed,
          },
          ipAddress:
            req.headers.get('x-forwarded-for') || req.headers.get('remote-address') || null,
          userAgent: (req.headers.get('user-agent') || null)?.slice(0, 191),
        },
      })
    } catch (logError) {
      console.error('Failed to log import:', logError)
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Import Excel error:', error)
    try {
      await prisma.errorLog.create({
        data: {
          userId: user?.id || null,
          level: 'ERROR',
          module: 'IMPORT',
          action: 'IMPORT_EXCEL',
          message: error.message || '导入Excel失败',
          stackTrace: error.stack,
          requestUrl: req.url,
          requestMethod: req.method,
          requestParams: {
            tableName: params.tableName,
          },
          tableId: table?.id || null,
          ipAddress:
            req.headers.get('x-forwarded-for') || req.headers.get('remote-address'),
          userAgent: (req.headers.get('user-agent') || '').slice(0, 191) || null,
        },
      })
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }
    return NextResponse.json({ message: '导入失败' }, { status: 500 })
  }
}

function convertValue(value: any, field: any): any {
  const strValue = value.toString().trim()

  switch (field.type) {
    case FieldType.NUMBER:
    case FieldType.INTEGER:
    case FieldType.FLOAT:
    case FieldType.MONEY: {
      const num = parseFloat(strValue)
      if (isNaN(num)) {
        throw new Error(`字段"${field.label}"的值"${strValue}"不是有效的数字`)
      }
      if (field.type === FieldType.INTEGER && !Number.isInteger(num)) {
        throw new Error(`字段"${field.label}"的值"${strValue}"必须是整数`)
      }
      return num
    }

    case FieldType.DATE:
    case FieldType.DATETIME: {
      const date = new Date(strValue)
      if (isNaN(date.getTime())) {
        throw new Error(`字段"${field.label}"的值"${strValue}"不是有效的日期格式`)
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
      throw new Error(`字段"${field.label}"的值"${strValue}"不是有效的布尔值`)
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
    default:
      return strValue
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  let user: any = null
  let table: any = null

  try {
    user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ message: '未登录' }, { status: 401 })
    }

    table = await prisma.dataTable.findUnique({
      where: { name: params.tableName },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    const isAdmin = user.role?.name === 'ADMIN'
    const isManager = user.role?.name === 'MANAGER'

    if (!isAdmin && !isManager) {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canImport) {
        return NextResponse.json({ message: '无权限导入数据' }, { status: 403 })
      }
    }

    const fields = table.fields.filter((f: any) => !f.isSystem)

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(table.label)

    const headers = [...fields.map((f: any) => f.label), '状态']
    worksheet.columns = headers.map((h, i) => ({
      header: h,
      key: `col_${i}`,
      width: 18,
    }))

    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, size: 11 }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5EDFE' },
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 25

    const exampleRow: any = {}
    fields.forEach((field: any, idx: number) => {
      let example = ''
      switch (field.type) {
        case FieldType.TEXT:
          example = field.placeholder || '示例文本'
          break
        case FieldType.NUMBER:
        case FieldType.INTEGER:
        case FieldType.FLOAT:
        case FieldType.MONEY:
          example = field.defaultValue || '0'
          break
        case FieldType.DATE:
          example = '2024-01-01'
          break
        case FieldType.DATETIME:
          example = '2024-01-01 12:00:00'
          break
        case FieldType.SELECT:
        case FieldType.RADIO:
          if (field.options && Array.isArray(field.options)) {
            example = field.options[0]?.label || field.options[0]?.value || ''
          }
          break
        case FieldType.MULTISELECT:
          if (field.options && Array.isArray(field.options)) {
            example = field.options
              .slice(0, 2)
              .map((o: any) => o.label || o.value)
              .join('、')
          }
          break
        case FieldType.SWITCH:
        case FieldType.CHECKBOX:
          example = '是/否'
          break
        default:
          example = ''
      }
      exampleRow[`col_${idx}`] = example
    })
    exampleRow[`col_${fields.length}`] = '草稿/已提交/已审核'

    const row = worksheet.addRow(exampleRow)
    row.font = { color: { argb: 'FF9CA3AF' }, italic: true }
    row.alignment = { vertical: 'middle' }

    const buffer = await workbook.xlsx.writeBuffer()
    const fileName = `${table.label}_导入模板.xlsx`

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (error: any) {
    console.error('Download template error:', error)
    return NextResponse.json({ message: '下载模板失败' }, { status: 500 })
  }
}
