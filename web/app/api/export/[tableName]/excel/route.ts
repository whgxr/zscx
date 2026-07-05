import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import ExcelJS from 'exceljs'
import { ExportType } from '@prisma/client'

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWED: '已审核',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
}

export async function GET(
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
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    })

    if (!table) {
      return NextResponse.json({ message: '数据表不存在' }, { status: 404 })
    }

    if (user.role?.name === 'USER' || user.role?.name === 'VIEWER') {
      const permission = await prisma.tablePermission.findUnique({
        where: { userId_tableId: { userId: user.id, tableId: table.id } },
      })
      if (!permission || !permission.canExport) {
        return NextResponse.json({ message: '无权限导出' }, { status: 403 })
      }
    }

    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || ''
    const type = (searchParams.get('type') as ExportType) || ExportType.STANDARD
    const templateId = searchParams.get('templateId')
    const fieldsParam = searchParams.get('fields')
    const useTemplate = searchParams.get('useTemplate') === 'true'
    const recordId = searchParams.get('recordId')

    const where: any = { tableId: table.id }
    if (status) where.status = status
    if (recordId) where.id = parseInt(recordId)

    const records = await prisma.dataRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    let selectedFields = table.fields.filter((f: any) => f.showInList)
    if (fieldsParam) {
      const fieldNames = fieldsParam.split(',')
      selectedFields = table.fields.filter((f: any) => fieldNames.includes(f.name))
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

    if (useTemplate && templateConfig?.grid) {
      await exportTemplateExcel(workbook, table, records, templateConfig, exportTemplate)
    } else {
      switch (type) {
        case ExportType.STANDARD:
          await exportStandardExcel(workbook, table, selectedFields, records, templateConfig)
          break
        case ExportType.CARD:
          await exportCardExcel(workbook, table, selectedFields, records, templateConfig)
          break
        case ExportType.GROUPED:
          await exportGroupedExcel(workbook, table, selectedFields, records, templateConfig)
          break
        case ExportType.FORM:
          await exportFormExcel(workbook, table, selectedFields, records, templateConfig)
          break
        default:
          await exportStandardExcel(workbook, table, selectedFields, records, templateConfig)
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    const typeNames: Record<string, string> = {
      STANDARD: '标准列表',
      CARD: '卡片式',
      GROUPED: '分组汇总',
      FORM: '表单式',
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(table.label)}_${typeNames[type] || '导出'}_${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (error) {
    console.error('Export Excel error:', error)
    return NextResponse.json({ message: '导出失败' }, { status: 500 })
  }
}

async function exportStandardExcel(
  workbook: ExcelJS.Workbook,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const worksheet = workbook.addWorksheet(table.label)

  const headers = ['ID', ...fields.map(f => f.label), '状态', '创建时间']
  worksheet.columns = headers.map((h, i) => ({
    header: h,
    key: i === 0 ? 'id' : i === headers.length - 1 ? 'createdAt' : i === headers.length - 2 ? 'status' : `field_${i - 1}`,
    width: config?.columnWidth || 15,
  }))

  const headerRow = worksheet.getRow(1)
  headerRow.font = { bold: true, size: config?.fontSize || 11 }
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: config?.headerBgColor || 'FFE5EDFE' },
  }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = config?.headerHeight || 25

  records.forEach((record, idx) => {
    const data = record.data as Record<string, any> || {}
    const rowData: any = {
      id: record.id,
      status: statusText[record.status] || record.status,
      createdAt: record.createdAt.toLocaleString('zh-CN'),
    }
    fields.forEach((field, fieldIdx) => {
      rowData[`field_${fieldIdx}`] = data[field.name]?.toString() || ''
    })
    const row = worksheet.addRow(rowData)
    row.alignment = { vertical: 'middle' }
    if (config?.zebraStripes && idx % 2 === 1) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: config?.zebraColor || 'FFF8F9FA' },
      }
    }
  })

  if (config?.showBorder) {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }
      })
    })
  }
}

async function exportCardExcel(
  workbook: ExcelJS.Workbook,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const worksheet = workbook.addWorksheet(table.label)

  const cardsPerRow = config?.cardsPerRow || 2
  const cardWidth = config?.cardWidth || 40
  const cardHeight = fields.length + 4

  records.forEach((record, recordIdx) => {
    const data = record.data as Record<string, any> || {}
    const rowOffset = Math.floor(recordIdx / cardsPerRow) * cardHeight
    const colOffset = (recordIdx % cardsPerRow) * (cardWidth + 2)

    const titleCell = worksheet.getCell(
      rowOffset + 1,
      colOffset + 1
    )
    titleCell.value = `记录 #${record.id} - ${statusText[record.status] || record.status}`
    titleCell.font = { bold: true, size: 12 }
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: config?.cardHeaderBgColor || 'FF3B82F6' },
    }
    titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
    worksheet.mergeCells(
      rowOffset + 1,
      colOffset + 1,
      rowOffset + 1,
      colOffset + 2
    )

    fields.forEach((field, fieldIdx) => {
      const labelCell = worksheet.getCell(
        rowOffset + 2 + fieldIdx,
        colOffset + 1
      )
      labelCell.value = field.label
      labelCell.font = { bold: true }
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      }

      const valueCell = worksheet.getCell(
        rowOffset + 2 + fieldIdx,
        colOffset + 2
      )
      valueCell.value = data[field.name]?.toString() || ''
    })

    const timeRow = rowOffset + 2 + fields.length
    const timeLabelCell = worksheet.getCell(timeRow, colOffset + 1)
    timeLabelCell.value = '创建时间'
    timeLabelCell.font = { bold: true }
    timeLabelCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF3F4F6' },
    }
    worksheet.getCell(timeRow, colOffset + 2).value = record.createdAt.toLocaleString('zh-CN')

    if (config?.showBorder) {
      for (let r = rowOffset + 1; r <= timeRow; r++) {
        for (let c = colOffset + 1; c <= colOffset + 2; c++) {
          worksheet.getCell(r, c).border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          }
        }
      }
    }
  })

  for (let i = 0; i < cardsPerRow; i++) {
    worksheet.getColumn(i * (cardWidth + 2) + 1).width = 15
    worksheet.getColumn(i * (cardWidth + 2) + 2).width = 25
  }
}

async function exportGroupedExcel(
  workbook: ExcelJS.Workbook,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const groupField = config?.groupField || fields[0]?.name
  const groupFieldInfo = fields.find(f => f.name === groupField) || fields[0]

  const groups: Record<string, any[]> = {}
  records.forEach((record) => {
    const data = record.data as Record<string, any> || {}
    const key = data[groupField]?.toString() || '未分类'
    if (!groups[key]) groups[key] = []
    groups[key].push(record)
  })

  const summarySheet = workbook.addWorksheet('分组汇总')
  const detailSheet = workbook.addWorksheet('详细数据')

  const summaryHeaders = [groupFieldInfo.label, '记录数']
  summarySheet.columns = summaryHeaders.map((h, i) => ({
    header: h,
    key: i === 0 ? 'group' : 'count',
    width: 20,
  }))

  const summaryHeaderRow = summarySheet.getRow(1)
  summaryHeaderRow.font = { bold: true }
  summaryHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5EDFE' },
  }
  summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }

  Object.entries(groups).forEach(([group, groupRecords]) => {
    summarySheet.addRow({
      group,
      count: groupRecords.length,
    })
  })

  const detailHeaders = ['组别', 'ID', ...fields.filter(f => f.name !== groupField).map(f => f.label), '状态', '创建时间']
  detailSheet.columns = detailHeaders.map((h, i) => ({
    header: h,
    key: i === 0 ? 'group' : i === 1 ? 'id' : i === detailHeaders.length - 1 ? 'createdAt' : i === detailHeaders.length - 2 ? 'status' : `field_${i - 2}`,
    width: 15,
  }))

  const detailHeaderRow = detailSheet.getRow(1)
  detailHeaderRow.font = { bold: true }
  detailHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5EDFE' },
  }
  detailHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' }

  let rowIdx = 0
  Object.entries(groups).forEach(([group, groupRecords]) => {
    groupRecords.forEach((record: any) => {
      const data = record.data as Record<string, any> || {}
      const otherFields = fields.filter(f => f.name !== groupField)
      const rowData: any = {
        group,
        id: record.id,
        status: statusText[record.status] || record.status,
        createdAt: record.createdAt.toLocaleString('zh-CN'),
      }
      otherFields.forEach((field, idx) => {
        rowData[`field_${idx}`] = data[field.name]?.toString() || ''
      })
      const row = detailSheet.addRow(rowData)
      if (config?.zebraStripes && rowIdx % 2 === 1) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8F9FA' },
        }
      }
      rowIdx++
    })
  })
}

async function exportFormExcel(
  workbook: ExcelJS.Workbook,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  records.forEach((record, idx) => {
    const worksheet = workbook.addWorksheet(`记录${record.id}`)
    const data = record.data as Record<string, any> || {}

    worksheet.getCell(1, 1).value = table.label
    worksheet.getCell(1, 1).font = { bold: true, size: 16 }
    worksheet.mergeCells(1, 1, 1, 4)

    worksheet.getCell(2, 1).value = `记录编号: #${record.id}`
    worksheet.getCell(2, 1).font = { size: 11 }
    worksheet.mergeCells(2, 1, 2, 2)

    worksheet.getCell(2, 3).value = `状态: ${statusText[record.status] || record.status}`
    worksheet.getCell(2, 3).font = { size: 11 }
    worksheet.mergeCells(2, 3, 2, 4)

    const columnsPerRow = config?.columnsPerRow || 2
    fields.forEach((field, fieldIdx) => {
      const row = 4 + Math.floor(fieldIdx / columnsPerRow) * 2
      const col = 1 + (fieldIdx % columnsPerRow) * 2

      const labelCell = worksheet.getCell(row, col)
      labelCell.value = field.label
      labelCell.font = { bold: true }
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      }
      labelCell.alignment = { vertical: 'middle' }

      const valueCell = worksheet.getCell(row, col + 1)
      valueCell.value = data[field.name]?.toString() || ''
      valueCell.alignment = { vertical: 'middle' }

      const valueRow = worksheet.getRow(row)
      valueRow.height = 25
    })

    const footerRow = 4 + Math.ceil(fields.length / columnsPerRow) * 2
    worksheet.getCell(footerRow, 1).value = `创建时间: ${record.createdAt.toLocaleString('zh-CN')}`
    worksheet.mergeCells(footerRow, 1, footerRow, 2)

    worksheet.getCell(footerRow, 3).value = `更新时间: ${record.updatedAt.toLocaleString('zh-CN')}`
    worksheet.mergeCells(footerRow, 3, footerRow, 4)

    worksheet.getColumn(1).width = 15
    worksheet.getColumn(2).width = 25
    worksheet.getColumn(3).width = 15
    worksheet.getColumn(4).width = 25
  })
}

async function exportTemplateExcel(
  workbook: ExcelJS.Workbook,
  table: any,
  records: any[],
  config: any,
  templateMeta: any
) {
  const grid = config.grid || []
  const styles = config.styles || []
  const colWidths = config.colWidths || []
  const rowHeights = config.rowHeights || []
  const mergedCells = config.mergedCells || []
  const formulas = config.formulas || []
  
  const worksheet = workbook.addWorksheet(templateMeta?.name || table.label)

  const maxRow = grid.length
  const maxCol = grid[0]?.length || 0

  for (let r = 0; r < maxRow; r++) {
    const row = worksheet.getRow(r + 1)
    row.height = rowHeights[r] || 20
    for (let c = 0; c < maxCol; c++) {
      const cell = row.getCell(c + 1)
      const cellData = grid[r]?.[c]
      if (!cellData) continue

      let cellValue = cellData.value || ''

      const cellStyle = styles[r]?.[c] || {}
      
      if (cellStyle.bold || cellStyle.italic || cellStyle.underline || cellStyle.fontSize || cellStyle.textColor) {
        cell.font = {
          bold: cellStyle.bold,
          italic: cellStyle.italic,
          underline: cellStyle.underline ? 'single' : undefined,
          size: cellStyle.fontSize,
          color: cellStyle.textColor ? { argb: 'FF' + cellStyle.textColor.replace('#', '').toUpperCase() } : undefined,
        }
      }

      if (cellStyle.bgColor) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + cellStyle.bgColor.replace('#', '').toUpperCase() },
        }
      }

      if (cellStyle.align || cellStyle.verticalAlign || cellStyle.wrapText) {
        cell.alignment = {
          horizontal: cellStyle.align as any,
          vertical: cellStyle.verticalAlign as any || 'middle',
          wrapText: cellStyle.wrapText,
        }
      }

      if (formulas[r]?.[c]) {
        cell.value = { formula: formulas[r][c].replace('=', '') }
      } else {
        cell.value = cellValue
      }
    }
  }

  for (let c = 0; c < maxCol; c++) {
    worksheet.getColumn(c + 1).width = (colWidths[c] || 150) / 10
  }

  mergedCells.forEach((merge: any) => {
    worksheet.mergeCells(
      merge.row + 1,
      merge.col + 1,
      merge.row + merge.rowspan,
      merge.col + merge.colspan
    )
  })

  const firstRecord = records[0]
  const firstData = firstRecord?.data as Record<string, any> || {}

  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const cell = worksheet.getCell(r + 1, c + 1)
      let value = cell.value?.toString() || ''

      const placeholders = value.match(/\{\{[^}]+\}\}/g)
      if (placeholders) {
        placeholders.forEach(placeholder => {
          const fieldName = placeholder.slice(2, -2)
          let fieldValue = ''

          if (fieldName === 'id') {
            fieldValue = firstRecord?.id?.toString() || ''
          } else if (fieldName === 'status') {
            fieldValue = statusText[firstRecord?.status] || firstRecord?.status || ''
          } else if (fieldName === 'createdAt' || fieldName === 'createTime') {
            fieldValue = firstRecord?.createdAt ? new Date(firstRecord.createdAt).toLocaleString('zh-CN') : ''
          } else if (fieldName === 'updatedAt' || fieldName === 'updateTime') {
            fieldValue = firstRecord?.updatedAt ? new Date(firstRecord.updatedAt).toLocaleString('zh-CN') : ''
          } else {
            fieldValue = firstData[fieldName]?.toString() || ''
          }

          value = value.replace(placeholder, fieldValue)
        })

        cell.value = value
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
        const offset = i * (dataEndRow - dataStartRow + 1)

        for (let r = dataStartRow; r <= dataEndRow; r++) {
          const targetRowIdx = maxRow + offset + (r - dataStartRow) + 1
          const sourceRowIdx = r + 1
          const targetRow = worksheet.getRow(targetRowIdx)
          targetRow.height = rowHeights[r] || 20

          for (let c = 0; c < maxCol; c++) {
            const sourceCell = worksheet.getCell(sourceRowIdx, c + 1)
            const targetCell = targetRow.getCell(c + 1)

            if (sourceCell.font) {
              targetCell.font = { ...sourceCell.font }
            }
            if (sourceCell.fill) {
              targetCell.fill = { ...sourceCell.fill }
            }
            if (sourceCell.alignment) {
              targetCell.alignment = { ...sourceCell.alignment }
            }

            let value = sourceCell.value?.toString() || ''
            const placeholders = value.match(/\{\{[^}]+\}\}/g)
            if (placeholders) {
              placeholders.forEach(placeholder => {
                const fieldName = placeholder.slice(2, -2)
                let fieldValue = ''

                if (fieldName === 'id') {
                  fieldValue = record.id?.toString() || ''
                } else if (fieldName === 'status') {
                  fieldValue = statusText[record.status] || record.status || ''
                } else if (fieldName === 'createdAt' || fieldName === 'createTime') {
                  fieldValue = record.createdAt ? new Date(record.createdAt).toLocaleString('zh-CN') : ''
                } else if (fieldName === 'updatedAt' || fieldName === 'updateTime') {
                  fieldValue = record.updatedAt ? new Date(record.updatedAt).toLocaleString('zh-CN') : ''
                } else {
                  fieldValue = data[fieldName]?.toString() || ''
                }

                value = value.replace(placeholder, fieldValue)
              })
            }

            targetCell.value = value
          }
        }
      }
    }
  }
}
