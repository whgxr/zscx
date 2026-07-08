import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { ExportType } from '@prisma/client'
import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import * as fs from 'fs'
import * as path from 'path'

const statusText: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  REVIEWED: '已审核',
  REJECTED: '已驳回',
  ARCHIVED: '已归档',
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

let cachedRegularFontBytes: Buffer | null = null
let cachedBoldFontBytes: Buffer | null = null

function loadFontBytes(): { regular: Buffer; bold: Buffer } {
  const fontDir = path.join(process.cwd(), 'public', 'fonts')
  const regularFontPath = path.join(fontDir, 'NotoSansSC-Regular.ttf')
  const boldFontPath = path.join(fontDir, 'NotoSansSC-Bold.ttf')
  
  if (!cachedRegularFontBytes) {
    cachedRegularFontBytes = fs.readFileSync(regularFontPath)
  }
  if (!cachedBoldFontBytes) {
    cachedBoldFontBytes = fs.readFileSync(boldFontPath)
  }
  
  return { regular: cachedRegularFontBytes, bold: cachedBoldFontBytes }
}

async function loadFonts(pdfDoc: PDFDocument): Promise<Fonts> {
  pdfDoc.registerFontkit(fontkit)
  
  const { regular: regularFontBytes, bold: boldFontBytes } = loadFontBytes()
  
  const regularFont = await pdfDoc.embedFont(regularFontBytes)
  const boldFont = await pdfDoc.embedFont(boldFontBytes)
  
  return { regular: regularFont, bold: boldFont }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
      }
    : { r: 0, g: 0, b: 0 }
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text) return ['']
  
  const lines: string[] = []
  let currentLine = ''
  
  for (const char of text) {
    const testLine = currentLine + char
    const width = font.widthOfTextAtSize(testLine, fontSize)
    if (width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine)
      currentLine = char
    } else {
      currentLine = testLine
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines.length > 0 ? lines : ['']
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

    const pdfDoc = await PDFDocument.create()
    const fonts = await loadFonts(pdfDoc)

    const typeNames: Record<string, string> = {
      STANDARD: '标准表格',
      CARD: '卡片式',
      GROUPED: '分组汇总',
      FORM: '表单式',
    }

    if (useTemplate && templateConfig?.grid) {
      await exportTemplatePdf(pdfDoc, fonts, table, records, templateConfig, exportTemplate)
    } else {
      const type = templateConfig?.type || ExportType.STANDARD
      const orientation = templateConfig?.orientation === 'landscape' 
        ? 'landscape' 
        : (selectedFields.length > 6 ? 'landscape' : 'portrait')

      switch (type) {
        case ExportType.STANDARD:
          await exportStandardPdf(pdfDoc, fonts, table, selectedFields, records, templateConfig, orientation)
          break
        case ExportType.CARD:
          await exportCardPdf(pdfDoc, fonts, table, selectedFields, records, templateConfig)
          break
        case ExportType.GROUPED:
          await exportGroupedPdf(pdfDoc, fonts, table, selectedFields, records, templateConfig, orientation)
          break
        case ExportType.FORM:
          await exportFormPdf(pdfDoc, fonts, table, selectedFields, records, templateConfig)
          break
        default:
          await exportStandardPdf(pdfDoc, fonts, table, selectedFields, records, templateConfig, orientation)
      }
    }

    const pdfBytes = await pdfDoc.save()
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

async function exportStandardPdf(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  table: any,
  fields: any[],
  records: any[],
  config: any,
  orientation: string
) {
  const isLandscape = orientation === 'landscape'
  const pageWidth = isLandscape ? 842 : 595
  const pageHeight = isLandscape ? 595 : 842
  
  let page = pdfDoc.addPage([pageWidth, pageHeight])
  const marginLeft = 40
  const marginRight = 40
  const marginTop = 40
  const marginBottom = 40
  const contentWidth = pageWidth - marginLeft - marginRight

  const titleSize = config?.titleSize || 16
  const fontSize = config?.fontSize || 10
  const headerColor = config?.headerColor || [59, 130, 246]
  const zebraColor = config?.zebraColor || [248, 249, 250]

  let currentY = pageHeight - marginTop

  page.drawText(table.label, {
    x: marginLeft,
    y: currentY,
    font: fonts.bold,
    size: titleSize,
    color: rgb(0, 0, 0),
  })
  currentY -= titleSize + 10

  page.drawText(`导出时间: ${new Date().toLocaleString('zh-CN')}`, {
    x: marginLeft,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 18

  page.drawText(`记录数: ${records.length}`, {
    x: marginLeft,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 25

  const headers = ['ID', ...fields.map(f => f.label), '状态', '创建时间']
  const body = records.map(record => {
    const data = record.data as Record<string, any> || {}
    return [
      record.id.toString(),
      ...fields.map(f => data[f.name]?.toString() || ''),
      statusText[record.status] || record.status,
      record.createdAt.toLocaleString('zh-CN'),
    ]
  })

  const colCount = headers.length
  const colWidth = contentWidth / colCount
  const rowHeight = Math.max(24, fontSize * 2)
  const headerHeight = Math.max(28, fontSize * 2.2)

  const headerColorRgb = {
    r: headerColor[0] / 255,
    g: headerColor[1] / 255,
    b: headerColor[2] / 255,
  }
  const zebraColorRgb = {
    r: zebraColor[0] / 255,
    g: zebraColor[1] / 255,
    b: zebraColor[2] / 255,
  }

  const drawRow = (rowData: string[], y: number, isHeader: boolean, isZebra: boolean) => {
    const cellPadding = 5
    
    if (isHeader) {
      page.drawRectangle({
        x: marginLeft,
        y: y - headerHeight,
        width: contentWidth,
        height: headerHeight,
        color: rgb(headerColorRgb.r, headerColorRgb.g, headerColorRgb.b),
      })
    } else if (isZebra && config?.zebraStripes) {
      page.drawRectangle({
        x: marginLeft,
        y: y - rowHeight,
        width: contentWidth,
        height: rowHeight,
        color: rgb(zebraColorRgb.r, zebraColorRgb.g, zebraColorRgb.b),
      })
    }

    page.drawRectangle({
      x: marginLeft,
      y: y - (isHeader ? headerHeight : rowHeight),
      width: contentWidth,
      height: isHeader ? headerHeight : rowHeight,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    })

    rowData.forEach((cell, colIdx) => {
      const x = marginLeft + colIdx * colWidth + cellPadding
      const textY = y - (isHeader ? headerHeight : rowHeight) + ((isHeader ? headerHeight : rowHeight) - fontSize) / 2 + fontSize * 0.3
      
      const maxTextWidth = colWidth - cellPadding * 2
      const displayFont = isHeader ? fonts.bold : fonts.regular
      const lines = wrapText(cell, displayFont, fontSize, maxTextWidth)
      
      const textColor = isHeader ? rgb(1, 1, 1) : rgb(0, 0, 0)
      
      let lineY = textY + (lines.length - 1) * (fontSize * 1.2) / 2
      lines.forEach((line) => {
        page.drawText(line, {
          x,
          y: lineY,
          font: displayFont,
          size: fontSize,
          color: textColor,
        })
        lineY -= fontSize * 1.2
      })

      if (colIdx > 0) {
        page.drawLine({
          start: { x: marginLeft + colIdx * colWidth, y: y - (isHeader ? headerHeight : rowHeight) },
          end: { x: marginLeft + colIdx * colWidth, y: y },
          color: rgb(0.8, 0.8, 0.8),
          thickness: 0.5,
        })
      }
    })
  }

  drawRow(headers, currentY, true, false)
  currentY -= headerHeight

  body.forEach((row, rowIdx) => {
    if (currentY - rowHeight < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      currentY = pageHeight - marginTop
      drawRow(headers, currentY, true, false)
      currentY -= headerHeight
    }
    drawRow(row, currentY, false, rowIdx % 2 === 1)
    currentY -= rowHeight
  })
}

async function exportCardPdf(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const pageWidth = 595
  const pageHeight = 842
  
  let page = pdfDoc.addPage([pageWidth, pageHeight])
  const pageMargin = 40

  const cardsPerRow = config?.cardsPerRow || 2
  const cardWidth = 260
  const cardPadding = 20
  const cardHeight = 150 + fields.length * 20

  let currentY = pageHeight - pageMargin
  let currentX = pageMargin
  let cardCount = 0

  const cardHeaderColor = config?.cardHeaderColor || [59, 130, 246]
  const headerColorRgb = {
    r: cardHeaderColor[0] / 255,
    g: cardHeaderColor[1] / 255,
    b: cardHeaderColor[2] / 255,
  }

  page.drawText(table.label, {
    x: pageMargin,
    y: currentY,
    font: fonts.bold,
    size: 16,
    color: rgb(0, 0, 0),
  })
  currentY -= 30

  page.drawText(`导出时间: ${new Date().toLocaleString('zh-CN')}`, {
    x: pageMargin,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 20

  page.drawText(`记录数: ${records.length}`, {
    x: pageMargin,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 30

  records.forEach((record) => {
    const data = record.data as Record<string, any> || {}

    if (cardCount > 0 && cardCount % cardsPerRow === 0) {
      currentX = pageMargin
      currentY -= cardHeight + 20
    }

    if (currentY - cardHeight < pageMargin) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      currentY = pageHeight - pageMargin
      currentX = pageMargin
    }

    page.drawRectangle({
      x: currentX,
      y: currentY - 35,
      width: cardWidth,
      height: 35,
      color: rgb(headerColorRgb.r, headerColorRgb.g, headerColorRgb.b),
    })

    page.drawText(`记录 #${record.id}`, {
      x: currentX + 15,
      y: currentY - 22,
      font: fonts.bold,
      size: 12,
      color: rgb(1, 1, 1),
    })

    let fieldY = currentY - 50
    fields.forEach((field) => {
      page.drawText(field.label + ':', {
        x: currentX + 15,
        y: fieldY,
        font: fonts.regular,
        size: 9,
        color: rgb(107 / 255, 114 / 255, 128 / 255),
      })

      const value = data[field.name]?.toString() || '-'
      const maxWidth = cardWidth - 100
      const lines = wrapText(value, fonts.regular, 10, maxWidth)
      lines.forEach((line, idx) => {
        page.drawText(line, {
          x: currentX + 80,
          y: fieldY - idx * 12,
          font: fonts.regular,
          size: 10,
          color: rgb(0, 0, 0),
        })
      })

      fieldY -= 20
    })

    page.drawText('状态:', {
      x: currentX + 15,
      y: fieldY,
      font: fonts.regular,
      size: 9,
      color: rgb(107 / 255, 114 / 255, 128 / 255),
    })
    page.drawText(statusText[record.status] || record.status, {
      x: currentX + 80,
      y: fieldY,
      font: fonts.regular,
      size: 10,
      color: rgb(0, 0, 0),
    })
    fieldY -= 20

    page.drawText('创建时间:', {
      x: currentX + 15,
      y: fieldY,
      font: fonts.regular,
      size: 9,
      color: rgb(107 / 255, 114 / 255, 128 / 255),
    })
    page.drawText(record.createdAt.toLocaleString('zh-CN'), {
      x: currentX + 80,
      y: fieldY,
      font: fonts.regular,
      size: 10,
      color: rgb(0, 0, 0),
    })

    page.drawRectangle({
      x: currentX,
      y: currentY - cardHeight,
      width: cardWidth,
      height: cardHeight,
      borderColor: rgb(229 / 255, 231 / 255, 235 / 255),
      borderWidth: 0.5,
    })

    currentX += cardWidth + cardPadding
    cardCount++
  })
}

async function exportGroupedPdf(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  table: any,
  fields: any[],
  records: any[],
  config: any,
  orientation: string
) {
  const isLandscape = orientation === 'landscape'
  const pageWidth = isLandscape ? 842 : 595
  const pageHeight = isLandscape ? 595 : 842
  
  let page = pdfDoc.addPage([pageWidth, pageHeight])
  const marginLeft = 40
  const marginRight = 40
  const marginTop = 40
  const marginBottom = 40
  const contentWidth = pageWidth - marginLeft - marginRight

  const groupField = config?.groupField || fields[0]?.name
  const groupFieldInfo = fields.find(f => f.name === groupField) || fields[0]

  const groups: Record<string, any[]> = {}
  records.forEach((record) => {
    const data = record.data as Record<string, any> || {}
    const key = data[groupField]?.toString() || '未分类'
    if (!groups[key]) groups[key] = []
    groups[key].push(record)
  })

  const headerColor = config?.headerColor || [59, 130, 246]
  const groupHeaderColor = config?.groupHeaderColor || [243, 244, 246]
  const headerColorRgb = { r: headerColor[0] / 255, g: headerColor[1] / 255, b: headerColor[2] / 255 }
  const groupHeaderColorRgb = { r: groupHeaderColor[0] / 255, g: groupHeaderColor[1] / 255, b: groupHeaderColor[2] / 255 }

  let currentY = pageHeight - marginTop
  const fontSize = 10

  page.drawText(table.label + ' - 分组汇总', {
    x: marginLeft,
    y: currentY,
    font: fonts.bold,
    size: 16,
    color: rgb(0, 0, 0),
  })
  currentY -= 26

  page.drawText(`导出时间: ${new Date().toLocaleString('zh-CN')}`, {
    x: marginLeft,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 18

  page.drawText(`分组字段: ${groupFieldInfo.label}`, {
    x: marginLeft,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 18

  page.drawText(`总记录数: ${records.length}`, {
    x: marginLeft,
    y: currentY,
    font: fonts.regular,
    size: 10,
    color: rgb(0, 0, 0),
  })
  currentY -= 25

  const otherFields = fields.filter(f => f.name !== groupField)
  const headers = ['ID', ...otherFields.map(f => f.label), '状态', '创建时间']
  const colCount = headers.length
  const colWidth = contentWidth / colCount
  const rowHeight = Math.max(24, fontSize * 2)
  const headerHeight = Math.max(28, fontSize * 2.2)

  const drawTableHeader = () => {
    page.drawRectangle({
      x: marginLeft,
      y: currentY - headerHeight,
      width: contentWidth,
      height: headerHeight,
      color: rgb(headerColorRgb.r, headerColorRgb.g, headerColorRgb.b),
    })
    headers.forEach((header, colIdx) => {
      const x = marginLeft + colIdx * colWidth + 5
      const textY = currentY - headerHeight + (headerHeight - fontSize) / 2 + fontSize * 0.3
      page.drawText(header, {
        x,
        y: textY,
        font: fonts.bold,
        size: fontSize,
        color: rgb(1, 1, 1),
      })
    })
    currentY -= headerHeight
  }

  const drawRow = (rowData: string[]) => {
    if (currentY - rowHeight < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      currentY = pageHeight - marginTop
      drawTableHeader()
    }

    rowData.forEach((cell, colIdx) => {
      const x = marginLeft + colIdx * colWidth + 5
      const textY = currentY - rowHeight + (rowHeight - fontSize) / 2 + fontSize * 0.3
      const maxTextWidth = colWidth - 10
      const lines = wrapText(cell, fonts.regular, fontSize, maxTextWidth)
      lines.forEach((line, idx) => {
        page.drawText(line, {
          x,
          y: textY + (lines.length - 1 - idx) * (fontSize * 1.2),
          font: fonts.regular,
          size: fontSize,
          color: rgb(0, 0, 0),
        })
      })
    })
    currentY -= rowHeight
  }

  Object.entries(groups).forEach(([group, groupRecords]) => {
    if (currentY - 30 < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      currentY = pageHeight - marginTop
    }

    page.drawRectangle({
      x: marginLeft,
      y: currentY - 30,
      width: contentWidth,
      height: 30,
      color: rgb(groupHeaderColorRgb.r, groupHeaderColorRgb.g, groupHeaderColorRgb.b),
    })
    page.drawText(`${groupFieldInfo.label}: ${group} (${groupRecords.length}条)`, {
      x: marginLeft + 10,
      y: currentY - 20,
      font: fonts.bold,
      size: 12,
      color: rgb(0, 0, 0),
    })
    currentY -= 40

    drawTableHeader()

    groupRecords.forEach((record: any) => {
      const data = record.data as Record<string, any> || {}
      const row = [
        record.id.toString(),
        ...otherFields.map(f => data[f.name]?.toString() || ''),
        statusText[record.status] || record.status,
        record.createdAt.toLocaleString('zh-CN'),
      ]
      drawRow(row)
    })

    currentY -= 10
  })
}

async function exportFormPdf(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  table: any,
  fields: any[],
  records: any[],
  config: any
) {
  const pageWidth = 595
  const pageHeight = 842
  
  const marginLeft = 40
  const marginRight = 40
  const marginTop = 50
  const marginBottom = 50

  const columnsPerRow = config?.columnsPerRow || 1
  const labelBgColor = config?.labelBgColor || [249, 250, 251]
  const labelBgColorRgb = { r: labelBgColor[0] / 255, g: labelBgColor[1] / 255, b: labelBgColor[2] / 255 }

  records.forEach((record, recordIdx) => {
    const data = record.data as Record<string, any> || {}
    const page = pdfDoc.addPage([pageWidth, pageHeight])

    let currentY = pageHeight - marginTop

    page.drawText(table.label, {
      x: marginLeft,
      y: currentY,
      font: fonts.bold,
      size: 18,
      color: rgb(0, 0, 0),
    })
    currentY -= 30

    page.drawText(`记录编号: #${record.id}`, {
      x: marginLeft,
      y: currentY,
      font: fonts.regular,
      size: 12,
      color: rgb(107 / 255, 114 / 255, 128 / 255),
    })
    page.drawText(`状态: ${statusText[record.status] || record.status}`, {
      x: 300,
      y: currentY,
      font: fonts.regular,
      size: 12,
      color: rgb(107 / 255, 114 / 255, 128 / 255),
    })
    currentY -= 20

    page.drawLine({
      start: { x: marginLeft, y: currentY },
      end: { x: pageWidth - marginRight, y: currentY },
      color: rgb(229 / 255, 231 / 255, 235 / 255),
      thickness: 0.5,
    })
    currentY -= 30

    const colWidth = (pageWidth - marginLeft - marginRight - (columnsPerRow - 1) * 30) / columnsPerRow

    fields.forEach((field, fieldIdx) => {
      const colIdx = fieldIdx % columnsPerRow
      const rowIdx = Math.floor(fieldIdx / columnsPerRow)

      if (colIdx === 0 && rowIdx > 0) {
        currentY -= 55
      }

      if (currentY - 45 < marginBottom) {
        const newPage = pdfDoc.addPage([pageWidth, pageHeight])
        currentY = pageHeight - marginTop
      }

      const x = marginLeft + colIdx * (colWidth + 30)

      page.drawRectangle({
        x,
        y: currentY - 20,
        width: colWidth,
        height: 20,
        color: rgb(labelBgColorRgb.r, labelBgColorRgb.g, labelBgColorRgb.b),
      })
      page.drawText(field.label, {
        x: x + 10,
        y: currentY - 14,
        font: fonts.bold,
        size: 10,
        color: rgb(0, 0, 0),
      })

      page.drawRectangle({
        x,
        y: currentY - 45,
        width: colWidth,
        height: 25,
        color: rgb(1, 1, 1),
        borderColor: rgb(229 / 255, 231 / 255, 235 / 255),
        borderWidth: 0.5,
      })

      const value = data[field.name]?.toString() || '-'
      const maxTextWidth = colWidth - 20
      const lines = wrapText(value, fonts.regular, 11, maxTextWidth)
      lines.forEach((line, idx) => {
        page.drawText(line, {
          x: x + 10,
          y: currentY - 30 - idx * 14,
          font: fonts.regular,
          size: 11,
          color: rgb(0, 0, 0),
        })
      })
    })

    currentY -= 50

    const footerY = currentY
    page.drawLine({
      start: { x: marginLeft, y: footerY + 20 },
      end: { x: pageWidth - marginRight, y: footerY + 20 },
      color: rgb(229 / 255, 231 / 255, 235 / 255),
      thickness: 0.5,
    })

    page.drawText(`创建时间: ${record.createdAt.toLocaleString('zh-CN')}`, {
      x: marginLeft,
      y: footerY,
      font: fonts.regular,
      size: 10,
      color: rgb(107 / 255, 114 / 255, 128 / 255),
    })
    page.drawText(`更新时间: ${record.updatedAt.toLocaleString('zh-CN')}`, {
      x: 300,
      y: footerY,
      font: fonts.regular,
      size: 10,
      color: rgb(107 / 255, 114 / 255, 128 / 255),
    })
  })
}

async function exportTemplatePdf(
  pdfDoc: PDFDocument,
  fonts: Fonts,
  table: any,
  records: any[],
  config: any,
  templateMeta: any
) {
  const grid = config.grid || []
  const colWidths = config.colWidths || []
  const rowHeights = config.rowHeights || []
  const pageSetup = config.pageSetup || {}

  const isLandscape = pageSetup.orientation === 'landscape'
  let pageWidth = isLandscape ? 842 : 595
  let pageHeight = isLandscape ? 595 : 842

  const marginLeft = (pageSetup.marginLeft || 0.5) * 72
  const marginRight = (pageSetup.marginRight || 0.5) * 72
  const marginTop = (pageSetup.marginTop || 0.5) * 72
  const marginBottom = (pageSetup.marginBottom || 0.5) * 72

  const maxRow = grid.length
  const maxCol = grid[0]?.length || 0

  let contentWidth = pageWidth - marginLeft - marginRight
  const totalColWidth = colWidths.reduce((sum: number, w: number) => sum + (w || 100), 0) || maxCol * 100

  if (totalColWidth > contentWidth && !isLandscape) {
    pageWidth = 842
    pageHeight = 595
    contentWidth = pageWidth - marginLeft - marginRight
  }

  const scaleFactor = Math.min(1, contentWidth / (totalColWidth * 0.75))

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let currentY = pageHeight - marginTop

  const firstRecord = records[0]
  const firstData = firstRecord?.data as Record<string, any> || {}

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

  const filledGrid = fillGridData(firstRecord, firstData)

  const drawCell = (cellData: any, x: number, y: number, width: number, height: number) => {
    if (cellData.bgColor) {
      const { r, g, b } = hexToRgb(cellData.bgColor)
      page.drawRectangle({
        x,
        y,
        width,
        height,
        color: rgb(r, g, b),
      })
    }

    const textColor = cellData.textColor 
      ? hexToRgb(cellData.textColor) 
      : { r: 0, g: 0, b: 0 }

    let fontSize = cellData.fontSize || 11
    fontSize = Math.max(6, fontSize * 0.75 * scaleFactor)

    const font = cellData.bold ? fonts.bold : fonts.regular
    const align = cellData.align || 'left'
    const text = cellData.value || ''
    const maxTextWidth = width - 10
    const lines = wrapText(text, font, fontSize, maxTextWidth)
    const lineHeight = fontSize * 1.2

    const totalTextHeight = lines.length * lineHeight
    let textY = y + (height - totalTextHeight) / 2 + fontSize * 0.7

    lines.forEach((line) => {
      let textX = x + 5
      if (align === 'center') {
        const textWidth = font.widthOfTextAtSize(line, fontSize)
        textX = x + width / 2 - textWidth / 2
      } else if (align === 'right') {
        const textWidth = font.widthOfTextAtSize(line, fontSize)
        textX = x + width - 5 - textWidth
      }

      page.drawText(line, {
        x: textX,
        y: textY,
        font,
        size: fontSize,
        color: rgb(textColor.r, textColor.g, textColor.b),
      })
      textY -= lineHeight
    })

    const borderColor = rgb(200 / 255, 200 / 255, 200 / 255)
    const borderWidth = 0.5

    if (cellData.borderTop || cellData.borderBottom || cellData.borderLeft || cellData.borderRight) {
      if (cellData.borderTop) {
        page.drawLine({
          start: { x, y: y + height },
          end: { x: x + width, y: y + height },
          color: borderColor,
          thickness: borderWidth,
        })
      }
      if (cellData.borderBottom) {
        page.drawLine({
          start: { x, y },
          end: { x: x + width, y },
          color: borderColor,
          thickness: borderWidth,
        })
      }
      if (cellData.borderLeft) {
        page.drawLine({
          start: { x, y },
          end: { x, y: y + height },
          color: borderColor,
          thickness: borderWidth,
        })
      }
      if (cellData.borderRight) {
        page.drawLine({
          start: { x: x + width, y },
          end: { x: x + width, y: y + height },
          color: borderColor,
          thickness: borderWidth,
        })
      }
    } else {
      page.drawRectangle({
        x,
        y,
        width,
        height,
        borderColor,
        borderWidth,
      })
    }
  }

  const getCellWidth = (col: number, colSpan: number) => {
    let width = 0
    for (let i = 0; i < colSpan && col + i < maxCol; i++) {
      width += (colWidths[col + i] || 100) * 0.75 * scaleFactor
    }
    return width
  }

  const getRowHeight = (row: number, rowSpan: number) => {
    let height = 0
    for (let i = 0; i < rowSpan && row + i < maxRow; i++) {
      height += (rowHeights[row + i] || 24) * 0.75 * scaleFactor
    }
    return height
  }

  for (let r = 0; r < maxRow; r++) {
    const rowHeight = (rowHeights[r] || 24) * 0.75 * scaleFactor
    if (currentY - rowHeight < marginBottom) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      currentY = pageHeight - marginTop
    }
    let currentX = marginLeft

    for (let c = 0; c < maxCol; c++) {
      const cellData = filledGrid[r]?.[c]
      const colSpan = cellData?.colSpan || 1
      const rowSpan = cellData?.rowSpan || 1
      const cellWidth = getCellWidth(c, colSpan)

      if (!cellData || cellData.mergeHidden) {
        currentX += (colWidths[c] || 100) * 0.75 * scaleFactor
        continue
      }

      const cellHeight = getRowHeight(r, rowSpan)
      drawCell(cellData, currentX, currentY - cellHeight, cellWidth, cellHeight)
      currentX += cellWidth
      c += colSpan - 1
    }

    currentY -= rowHeight
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
          const rowHeight = (rowHeights[r] || 24) * 0.75 * scaleFactor
          if (currentY - rowHeight < marginBottom) {
            page = pdfDoc.addPage([pageWidth, pageHeight])
            currentY = pageHeight - marginTop
          }
          let currentX = marginLeft

          for (let c = 0; c < maxCol; c++) {
            const cellData = recordFilledGrid[r]?.[c]
            const colSpan = cellData?.colSpan || 1
            const rowSpan = cellData?.rowSpan || 1
            const cellWidth = getCellWidth(c, colSpan)

            if (!cellData || cellData.mergeHidden) {
              currentX += (colWidths[c] || 100) * 0.75 * scaleFactor
              continue
            }

            const cellHeight = getRowHeight(r, rowSpan)
            drawCell(cellData, currentX, currentY - cellHeight, cellWidth, cellHeight)
            currentX += cellWidth
            c += colSpan - 1
          }

          currentY -= rowHeight
        }
      }
    }
  }
}
