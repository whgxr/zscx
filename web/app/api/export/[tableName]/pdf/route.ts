import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { ExportType } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWED: '已审核',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

export async function GET(
  req: NextRequest,
  { params }: { params: { tableName: string } }
) {
  let user: any = null
  let table: any = null
  let templateId: string | null = null
  let useTemplate: boolean = false
  let search: string = ''
  let status: string = ''
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

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canExportPdf) {
        return NextResponse.json({ message: '无权限导出PDF' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(req.url)
    search = searchParams.get('search') || ''
    status = searchParams.get('status') || ''
    templateId = searchParams.get('templateId')
    const fieldsParam = searchParams.get('fields')
    const recordId = searchParams.get('recordId')
    useTemplate = searchParams.get('useTemplate') === 'true'

    const where: any = { tableId: table.id }
    if (status) where.status = status
    if (recordId) where.id = parseInt(recordId)

    const records = await prisma.dataRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: recordId ? 1 : 100,
    })

    let selectedFields = table.fields.filter((f: any) => f.showInList)
    if (fieldsParam) {
      const fieldNames = fieldsParam.split(',')
      selectedFields = table.fields.filter((f: any) => fieldNames.includes(f.name))
      selectedFields.sort((a: any, b: any) => {
        return fieldNames.indexOf(a.name) - fieldNames.indexOf(b.name)
      })
    }

    let templateConfig: any = null
    let exportTemplate: any = null
    if (templateId) {
      exportTemplate = await prisma.exportTemplate.findUnique({
        where: { id: parseInt(templateId) },
      })
      if (exportTemplate) {
        templateConfig = exportTemplate.config
        if (templateConfig?.fields) {
          const fieldNames = templateConfig.fields.map((f: any) => f.name)
          selectedFields = table.fields.filter((f: any) => fieldNames.includes(f.name))
          selectedFields.sort((a: any, b: any) => {
            return fieldNames.indexOf(a.name) - fieldNames.indexOf(b.name)
          })
        }
      }
    }

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(table.label)

    const typeNames: Record<string, string> = {
      STANDARD: '标准表格',
      CARD: '卡片式',
      GROUPED: '分组汇总',
      FORM: '表单式',
    }

    if (useTemplate && templateConfig?.grid) {
      await exportTemplateExcel(worksheet, table, records, templateConfig, exportTemplate)
    } else {
      const type = templateConfig?.type || ExportType.STANDARD
      const orientation = templateConfig?.orientation === 'landscape'
        ? 'landscape'
        : (selectedFields.length > 6 ? 'landscape' : 'portrait')

      switch (type) {
        case ExportType.STANDARD:
          await exportStandardExcel(worksheet, table, selectedFields, records, templateConfig)
          break
        case ExportType.CARD:
          await exportCardExcel(worksheet, table, selectedFields, records, templateConfig)
          break
        case ExportType.GROUPED:
          await exportGroupedExcel(worksheet, table, selectedFields, records, templateConfig)
          break
        case ExportType.FORM:
          await exportFormExcel(worksheet, table, selectedFields, records, templateConfig)
          break
        default:
          await exportStandardExcel(worksheet, table, selectedFields, records, templateConfig)
      }
    }

    const excelBuffer = await workbook.xlsx.writeBuffer()

    const tempDir = path.join(process.cwd(), 'tmp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    const timestamp = Date.now()
    const excelPath = path.join(tempDir, `export_${timestamp}.xlsx`)
    const pdfPath = path.join(tempDir, `export_${timestamp}.pdf`)

    fs.writeFileSync(excelPath, excelBuffer as unknown as Buffer)

    try {
      execSync(`soffice --headless --convert-to pdf "${excelPath}" --outdir "${tempDir}"`)
    } catch (convertError) {
      console.error('Excel to PDF conversion failed:', convertError)
      fs.unlinkSync(excelPath)
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath)
      }
      return NextResponse.json({ message: 'PDF转换失败' }, { status: 500 })
    }

    if (!fs.existsSync(pdfPath)) {
      fs.unlinkSync(excelPath)
      return NextResponse.json({ message: 'PDF转换失败' }, { status: 500 })
    }

    const pdfBytes = fs.readFileSync(pdfPath)

    fs.unlinkSync(excelPath)
    fs.unlinkSync(pdfPath)

    const type = templateConfig?.type || ExportType.STANDARD
    const fileName = `${table.label}_${typeNames[type] || '导出'}_${new Date().toISOString().slice(0, 10)}.pdf`

    try {
      await prisma.operationLog.create({
        data: {
          userId: user.id,
          action: 'EXPORT_PDF',
          module: 'EXPORT',
          tableId: table.id,
          detail: {
            templateId,
            useTemplate,
            recordCount: records.length,
            fileName,
          },
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('remote-address') || null,
          userAgent: req.headers.get('user-agent') || null,
        },
      })
    } catch (logError) {
      console.error('Failed to log export:', logError)
    }

    const isPreview = searchParams.get('preview') === 'true'
    const disposition = isPreview ? 'inline' : 'attachment'

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBytes.length.toString(),
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': isPreview ? 'no-cache, no-store, must-revalidate' : 'private, max-age=0',
      },
    })
  } catch (error: any) {
    console.error('Export PDF error:', error)
    try {
      await prisma.errorLog.create({
        data: {
          userId: user?.id || null,
          level: 'ERROR',
          module: 'EXPORT',
          action: 'EXPORT_PDF',
          message: error.message || '导出PDF失败',
          stackTrace: error.stack,
          requestUrl: req.url,
          requestMethod: req.method,
          requestParams: {
            tableName: params.tableName,
            templateId,
            useTemplate,
            search,
            status,
          },
          tableId: table?.id || null,
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('remote-address'),
          userAgent: req.headers.get('user-agent'),
        },
      })
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }
    return NextResponse.json({ message: '导出失败' }, { status: 500 })
  }
}

async function exportStandardExcel(
  worksheet: ExcelJS.Worksheet,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const titleSize = config?.titleSize || 16
  const fontSize = config?.fontSize || 12
  const headerColor = config?.headerColor || [59, 130, 246]

  let currentRow = 1

  worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(65 + fields.length + 2)}${currentRow}`)
  const titleCell = worksheet.getCell(`A${currentRow}`)
  titleCell.value = table.label
  titleCell.font = { size: titleSize, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `导出时间: ${new Date().toLocaleString('zh-CN')}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `记录数: ${records.length}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  currentRow++

  const headers = ['ID', ...fields.map(f => f.label), '状态', '创建时间']
  const headerRow = worksheet.addRow(headers)
  headerRow.eachCell((cell: any, colNumber: number) => {
    cell.font = { size: fontSize, bold: true }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${headerColor[0].toString(16).padStart(2, '0')}${headerColor[1].toString(16).padStart(2, '0')}${headerColor[2].toString(16).padStart(2, '0')}` },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    }
  })

  records.forEach((record: any) => {
    const data = record.data as Record<string, any> || {}
    const rowData = [
      record.id.toString(),
      ...fields.map(f => data[f.name]?.toString() || ''),
      statusText[record.status] || record.status,
      record.createdAt.toLocaleString('zh-CN'),
    ]
    const row = worksheet.addRow(rowData)
    row.eachCell((cell: any) => {
      cell.font = { size: fontSize }
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
    })
  })

  for (let i = 1; i <= headers.length; i++) {
    worksheet.columns[i - 1].width = 15
  }
}

async function exportCardExcel(
  worksheet: ExcelJS.Worksheet,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const fontSize = config?.fontSize || 11
  const cardHeaderColor = config?.cardHeaderColor || [59, 130, 246]

  let currentRow = 1

  worksheet.mergeCells(`A${currentRow}:D${currentRow}`)
  const titleCell = worksheet.getCell(`A${currentRow}`)
  titleCell.value = table.label
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `导出时间: ${new Date().toLocaleString('zh-CN')}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `记录数: ${records.length}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  currentRow++

  records.forEach((record: any) => {
    const data = record.data as Record<string, any> || {}

    worksheet.mergeCells(`A${currentRow}:D${currentRow}`)
    const cardHeader = worksheet.getCell(`A${currentRow}`)
    cardHeader.value = `记录 #${record.id}`
    cardHeader.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } }
    cardHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${cardHeaderColor[0].toString(16).padStart(2, '0')}${cardHeaderColor[1].toString(16).padStart(2, '0')}${cardHeaderColor[2].toString(16).padStart(2, '0')}` },
    }
    cardHeader.alignment = { horizontal: 'left', vertical: 'middle' }
    currentRow++

    fields.forEach((field: any) => {
      worksheet.getCell(`A${currentRow}`).value = field.label + ':'
      worksheet.getCell(`A${currentRow}`).font = { size: fontSize, bold: true, color: { argb: 'FF6B7280' } }
      worksheet.getCell(`B${currentRow}`).value = data[field.name]?.toString() || '-'
      worksheet.getCell(`B${currentRow}`).font = { size: fontSize }
      currentRow++
    })

    worksheet.getCell(`A${currentRow}`).value = '状态:'
    worksheet.getCell(`A${currentRow}`).font = { size: fontSize, bold: true, color: { argb: 'FF6B7280' } }
    worksheet.getCell(`B${currentRow}`).value = statusText[record.status] || record.status
    worksheet.getCell(`B${currentRow}`).font = { size: fontSize }
    currentRow++

    worksheet.getCell(`A${currentRow}`).value = '创建时间:'
    worksheet.getCell(`A${currentRow}`).font = { size: fontSize, bold: true, color: { argb: 'FF6B7280' } }
    worksheet.getCell(`B${currentRow}`).value = record.createdAt.toLocaleString('zh-CN')
    worksheet.getCell(`B${currentRow}`).font = { size: fontSize }
    currentRow++

    currentRow++
  })

  worksheet.columns[0].width = 25
  worksheet.columns[1].width = 40
}

async function exportGroupedExcel(
  worksheet: ExcelJS.Worksheet,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const fontSize = config?.fontSize || 12
  const headerColor = config?.headerColor || [59, 130, 246]
  const groupHeaderColor = config?.groupHeaderColor || [243, 244, 246]

  const groupField = config?.groupField || fields[0]?.name
  const groupFieldInfo = fields.find(f => f.name === groupField) || fields[0]

  const groups: Record<string, any[]> = {}
  records.forEach((record: any) => {
    const data = record.data as Record<string, any> || {}
    const key = data[groupField]?.toString() || '未分类'
    if (!groups[key]) groups[key] = []
    groups[key].push(record)
  })

  let currentRow = 1

  worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(65 + fields.length + 1)}${currentRow}`)
  const titleCell = worksheet.getCell(`A${currentRow}`)
  titleCell.value = table.label + ' - 分组汇总'
  titleCell.font = { size: 16, bold: true }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `导出时间: ${new Date().toLocaleString('zh-CN')}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `分组字段: ${groupFieldInfo.label}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  worksheet.getCell(`A${currentRow}`).value = `总记录数: ${records.length}`
  worksheet.getCell(`A${currentRow}`).font = { size: 10 }
  currentRow++

  currentRow++

  const otherFields = fields.filter(f => f.name !== groupField)
  const headers = ['ID', ...otherFields.map(f => f.label), '状态', '创建时间']

  Object.entries(groups).forEach(([group, groupRecords]) => {
    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(65 + headers.length - 1)}${currentRow}`)
    const groupHeader = worksheet.getCell(`A${currentRow}`)
    groupHeader.value = `${groupFieldInfo.label}: ${group} (${groupRecords.length}条)`
    groupHeader.font = { size: 12, bold: true }
    groupHeader.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${groupHeaderColor[0].toString(16).padStart(2, '0')}${groupHeaderColor[1].toString(16).padStart(2, '0')}${groupHeaderColor[2].toString(16).padStart(2, '0')}` },
    }
    groupHeader.alignment = { horizontal: 'left', vertical: 'middle' }
    currentRow++

    const headerRow = worksheet.addRow(headers)
    headerRow.eachCell((cell: any) => {
      cell.font = { size: fontSize, bold: true }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${headerColor[0].toString(16).padStart(2, '0')}${headerColor[1].toString(16).padStart(2, '0')}${headerColor[2].toString(16).padStart(2, '0')}` },
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
    })

    groupRecords.forEach((record: any) => {
      const data = record.data as Record<string, any> || {}
      const rowData = [
        record.id.toString(),
        ...otherFields.map(f => data[f.name]?.toString() || ''),
        statusText[record.status] || record.status,
        record.createdAt.toLocaleString('zh-CN'),
      ]
      const row = worksheet.addRow(rowData)
      row.eachCell((cell: any) => {
        cell.font = { size: fontSize }
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        }
      })
    })

    currentRow++
  })

  for (let i = 1; i <= headers.length; i++) {
    worksheet.columns[i - 1].width = 15
  }
}

async function exportFormExcel(
  worksheet: ExcelJS.Worksheet,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const fontSize = config?.fontSize || 12
  const columnsPerRow = config?.columnsPerRow || 1
  const labelBgColor = config?.labelBgColor || [249, 250, 251]

  records.forEach((record: any) => {
    const data = record.data as Record<string, any> || {}
    let currentRow = 1

    worksheet.mergeCells(`A${currentRow}:${String.fromCharCode(65 + columnsPerRow - 1)}${currentRow}`)
    const titleCell = worksheet.getCell(`A${currentRow}`)
    titleCell.value = table.label
    titleCell.font = { size: 18, bold: true }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    currentRow++

    worksheet.getCell(`A${currentRow}`).value = `记录编号: #${record.id}`
    worksheet.getCell(`A${currentRow}`).font = { size: 12, color: { argb: 'FF6B7280' } }
    worksheet.getCell(`B${currentRow}`).value = `状态: ${statusText[record.status] || record.status}`
    worksheet.getCell(`B${currentRow}`).font = { size: 12, color: { argb: 'FF6B7280' } }
    currentRow++

    currentRow++

    fields.forEach((field: any, fieldIdx: number) => {
      const colIdx = fieldIdx % columnsPerRow
      const rowIdx = Math.floor(fieldIdx / columnsPerRow)

      if (colIdx === 0 && rowIdx > 0) {
        currentRow++
      }

      const colLetter = String.fromCharCode(65 + colIdx)

      const labelCell = worksheet.getCell(`${colLetter}${currentRow}`)
      labelCell.value = field.label
      labelCell.font = { size: fontSize, bold: true }
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${labelBgColor[0].toString(16).padStart(2, '0')}${labelBgColor[1].toString(16).padStart(2, '0')}${labelBgColor[2].toString(16).padStart(2, '0')}` },
      }
      labelCell.alignment = { horizontal: 'left', vertical: 'middle' }
      labelCell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
      currentRow++

      const valueCell = worksheet.getCell(`${colLetter}${currentRow}`)
      valueCell.value = data[field.name]?.toString() || '-'
      valueCell.font = { size: fontSize }
      valueCell.alignment = { horizontal: 'left', vertical: 'middle' }
      valueCell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' },
      }
    })

    currentRow += 2

    worksheet.getCell(`A${currentRow}`).value = `创建时间: ${record.createdAt.toLocaleString('zh-CN')}`
    worksheet.getCell(`A${currentRow}`).font = { size: 10, color: { argb: 'FF6B7280' } }
    worksheet.getCell(`B${currentRow}`).value = `更新时间: ${record.updatedAt.toLocaleString('zh-CN')}`
    worksheet.getCell(`B${currentRow}`).font = { size: 10, color: { argb: 'FF6B7280' } }
    currentRow += 5
  })

  for (let i = 0; i < columnsPerRow; i++) {
    worksheet.columns[i].width = 35
  }
}

async function exportTemplateExcel(
  worksheet: ExcelJS.Worksheet,
  table: any,
  records: any[],
  config: any,
  templateMeta: any
) {
  const grid = config.grid || []
  const colWidths = config.colWidths || []
  const rowHeights = config.rowHeights || []
  const pageSetup = config.pageSetup || {}

  const maxRow = grid.length
  const maxCol = grid[0]?.length || 0

  const fillGridData = (record: any, recordData: any) => {
    const filledGrid: any[] = []
    for (let r = 0; r < maxRow; r++) {
      filledGrid[r] = []
      for (let c = 0; c < maxCol; c++) {
        const cellData = grid[r]?.[c]
        if (!cellData) {
          filledGrid[r][c] = null
          continue
        }

        if (cellData.mergeHidden) {
          filledGrid[r][c] = { ...cellData, value: '' }
          continue
        }

        let cellValue = cellData.value || ''

        const placeholders = cellValue.match(/\{\{[^}]+\}\}/g)
        if (placeholders) {
          placeholders.forEach((placeholder: string) => {
            const fieldName = placeholder.slice(2, -2)
            let fieldValue = ''

            if (fieldName === 'id') {
              fieldValue = record?.id?.toString() || ''
            } else if (fieldName === 'status') {
              fieldValue = statusText[record?.status] || record?.status || ''
            } else if (fieldName === 'createdAt' || fieldName === 'createTime') {
              fieldValue = record?.createdAt ? new Date(record.createdAt).toLocaleString('zh-CN') : ''
            } else if (fieldName === 'updatedAt' || fieldName === 'updateTime') {
              fieldValue = record?.updatedAt ? new Date(record.updatedAt).toLocaleString('zh-CN') : ''
            } else {
              fieldValue = recordData[fieldName]?.toString() || ''
            }

            cellValue = cellValue.replace(placeholder, fieldValue)
          })
        }

        filledGrid[r][c] = { ...cellData, value: cellValue }
      }
    }
    return filledGrid
  }

  for (let c = 0; c < maxCol; c++) {
    worksheet.columns[c].width = (colWidths[c] || 100) / 8
  }

  for (let r = 0; r < maxRow; r++) {
    worksheet.getRow(r + 1).height = rowHeights[r] || 24
  }

  const firstRecord = records[0]
  const firstData = firstRecord?.data as Record<string, any> || {}
  const filledGrid = fillGridData(firstRecord, firstData)

  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const cellData = filledGrid[r]?.[c]
      if (!cellData || cellData.mergeHidden) continue

      const cell = worksheet.getCell(r + 1, c + 1)
      cell.value = cellData.value || ''

      if (cellData.bgColor) {
        const rgb = hexToRgb(cellData.bgColor)
        if (rgb) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}` },
          }
        }
      }

      if (cellData.textColor) {
        const rgb = hexToRgb(cellData.textColor)
        if (rgb) {
          cell.font = {
            ...cell.font,
            color: { argb: `FF${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}` },
          }
        }
      }

      if (cellData.fontSize) {
        cell.font = { ...cell.font, size: cellData.fontSize }
      }

      if (cellData.bold) {
        cell.font = { ...cell.font, bold: true }
      }

      if (cellData.align) {
        cell.alignment = { ...cell.alignment, horizontal: cellData.align }
      }

      if (cellData.borderTop || cellData.borderBottom || cellData.borderLeft || cellData.borderRight) {
        cell.border = {
          top: cellData.borderTop ? { style: 'thin' } : undefined,
          bottom: cellData.borderBottom ? { style: 'thin' } : undefined,
          left: cellData.borderLeft ? { style: 'thin' } : undefined,
          right: cellData.borderRight ? { style: 'thin' } : undefined,
        }
      } else {
        cell.border = {
          top: { style: 'thin' },
          bottom: { style: 'thin' },
          left: { style: 'thin' },
          right: { style: 'thin' },
        }
      }
    }
  }

  if (records.length > 1) {
    let dataStartRow = -1
    let dataEndRow = -1

    for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c < maxCol; c++) {
        const cellValue = grid[r]?.[c]?.value || ''
        if (cellValue.match(/\{\{[^}]+\}\}/)) {
          if (dataStartRow === -1) dataStartRow = r
          dataEndRow = r
        }
      }
    }

    if (dataStartRow >= 0 && dataEndRow >= 0) {
      for (let i = 1; i < records.length; i++) {
        const record = records[i]
        const data = record.data as Record<string, any> || {}
        const recordFilledGrid = fillGridData(record, data)

        for (let r = dataStartRow; r <= dataEndRow; r++) {
          for (let c = 0; c < maxCol; c++) {
            const cellData = recordFilledGrid[r]?.[c]
            if (!cellData || cellData.mergeHidden) continue

            const cell = worksheet.getCell(r + 1 + (i - 1) * (dataEndRow - dataStartRow + 1), c + 1)
            cell.value = cellData.value || ''

            if (cellData.bgColor) {
              const rgb = hexToRgb(cellData.bgColor)
              if (rgb) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: `FF${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}` },
                }
              }
            }

            if (cellData.textColor) {
              const rgb = hexToRgb(cellData.textColor)
              if (rgb) {
                cell.font = {
                  ...cell.font,
                  color: { argb: `FF${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}` },
                }
              }
            }

            if (cellData.fontSize) {
              cell.font = { ...cell.font, size: cellData.fontSize }
            }

            if (cellData.bold) {
              cell.font = { ...cell.font, bold: true }
            }

            if (cellData.align) {
              cell.alignment = { ...cell.alignment, horizontal: cellData.align }
            }

            if (cellData.borderTop || cellData.borderBottom || cellData.borderLeft || cellData.borderRight) {
              cell.border = {
                top: cellData.borderTop ? { style: 'thin' } : undefined,
                bottom: cellData.borderBottom ? { style: 'thin' } : undefined,
                left: cellData.borderLeft ? { style: 'thin' } : undefined,
                right: cellData.borderRight ? { style: 'thin' } : undefined,
              }
            } else {
              cell.border = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' },
              }
            }
          }
        }
      }
    }
  }
}
