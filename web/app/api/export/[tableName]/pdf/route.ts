import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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
    const templateId = searchParams.get('templateId')
    const fieldsParam = searchParams.get('fields')
    const recordId = searchParams.get('recordId')

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
    }

    let templateConfig: any = null
    if (templateId) {
      const template = await prisma.exportTemplate.findUnique({
        where: { id: parseInt(templateId) },
      })
      if (template) {
        templateConfig = template.config
        if (templateConfig?.fields) {
          const fieldNames = templateConfig.fields.map((f: any) => f.name)
          selectedFields = table.fields.filter((f: any) => fieldNames.includes(f.name))
          selectedFields.sort((a: any, b: any) => {
            return fieldNames.indexOf(a.name) - fieldNames.indexOf(b.name)
          })
        }
      }
    }

    const type = templateConfig?.type || ExportType.STANDARD

    let doc: jsPDF
    const orientation = templateConfig?.orientation === 'landscape' ? 'landscape' : (selectedFields.length > 6 ? 'landscape' : 'portrait')

    switch (type) {
      case ExportType.STANDARD:
        doc = exportStandardPdf(table, selectedFields, records, templateConfig, orientation)
        break
      case ExportType.CARD:
        doc = exportCardPdf(table, selectedFields, records, templateConfig)
        break
      case ExportType.GROUPED:
        doc = exportGroupedPdf(table, selectedFields, records, templateConfig, orientation)
        break
      case ExportType.FORM:
        doc = exportFormPdf(table, selectedFields, records, templateConfig)
        break
      default:
        doc = exportStandardPdf(table, selectedFields, records, templateConfig, orientation)
    }

    const buffer = doc.output('arraybuffer')
    const typeNames: Record<string, string> = {
      STANDARD: '标准表格',
      CARD: '卡片式',
      GROUPED: '分组汇总',
      FORM: '表单式',
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(table.label)}_${typeNames[type] || '导出'}_${new Date().toISOString().slice(0, 10)}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Export PDF error:', error)
    return NextResponse.json({ message: '导出失败' }, { status: 500 })
  }
}

function exportStandardPdf(
  table: any,
  fields: any[],
  records: any[],
  config: any,
  orientation: string
): jsPDF {
  const doc = new jsPDF({
    orientation: orientation as any,
    unit: 'pt',
  })

  doc.setFontSize(config?.titleSize || 16)
  doc.text(table.label, 40, 40)
  doc.setFontSize(10)
  doc.text(`导出时间: ${new Date().toLocaleString('zh-CN')}`, 40, 60)
  doc.text(`记录数: ${records.length}`, 40, 75)

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

  autoTable(doc, {
    head: [headers],
    body: body,
    startY: 90,
    styles: { fontSize: config?.fontSize || 8 },
    headStyles: {
      fillColor: config?.headerColor || [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: config?.zebraStripes ? {
      fillColor: config?.zebraColor || [248, 249, 250],
    } : undefined,
    margin: { left: 40, right: 40 },
    theme: config?.showBorder ? 'grid' : 'striped',
  })

  return doc
}

function exportCardPdf(
  table: any,
  fields: any[],
  records: any[],
  config: any
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
  })

  const cardsPerRow = config?.cardsPerRow || 2
  const cardWidth = 260
  const cardPadding = 20
  const pageMargin = 40
  const cardHeight = 150 + fields.length * 20

  let currentY = pageMargin
  let currentX = pageMargin
  let cardCount = 0

  doc.setFontSize(16)
  doc.text(table.label, pageMargin, currentY)
  currentY += 30
  doc.setFontSize(10)
  doc.text(`导出时间: ${new Date().toLocaleString('zh-CN')}`, pageMargin, currentY)
  currentY += 20
  doc.text(`记录数: ${records.length}`, pageMargin, currentY)
  currentY += 30

  records.forEach((record, idx) => {
    const data = record.data as Record<string, any> || {}

    if (cardCount > 0 && cardCount % cardsPerRow === 0) {
      currentX = pageMargin
      currentY += cardHeight + 20
    }

    if (currentY + cardHeight > doc.internal.pageSize.height - pageMargin) {
      doc.addPage()
      currentY = pageMargin
      currentX = pageMargin
    }

    doc.setFillColor(config?.cardHeaderColor || [59, 130, 246])
    doc.rect(currentX, currentY, cardWidth, 35, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(12)
    doc.text(`记录 #${record.id}`, currentX + 15, currentY + 22)
    doc.setTextColor(0, 0, 0)

    let fieldY = currentY + 50
    fields.forEach((field) => {
      doc.setFontSize(9)
      doc.setTextColor(107, 114, 128)
      doc.text(field.label + ':', currentX + 15, fieldY)
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)
      doc.text(data[field.name]?.toString() || '-', currentX + 80, fieldY)
      fieldY += 20
    })

    doc.setFontSize(9)
    doc.setTextColor(107, 114, 128)
    doc.text('状态:', currentX + 15, fieldY)
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.text(statusText[record.status] || record.status, currentX + 80, fieldY)
    fieldY += 20

    doc.setFontSize(9)
    doc.setTextColor(107, 114, 128)
    doc.text('创建时间:', currentX + 15, fieldY)
    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.text(record.createdAt.toLocaleString('zh-CN'), currentX + 80, fieldY)

    if (config?.showBorder) {
      doc.setDrawColor(229, 231, 235)
      doc.rect(currentX, currentY, cardWidth, cardHeight, 'S')
    }

    currentX += cardWidth + cardPadding
    cardCount++
  })

  return doc
}

function exportGroupedPdf(
  table: any,
  fields: any[],
  records: any[],
  config: any,
  orientation: string
): jsPDF {
  const doc = new jsPDF({
    orientation: orientation as any,
    unit: 'pt',
  })

  const groupField = config?.groupField || fields[0]?.name
  const groupFieldInfo = fields.find(f => f.name === groupField) || fields[0]

  const groups: Record<string, any[]> = {}
  records.forEach((record) => {
    const data = record.data as Record<string, any> || {}
    const key = data[groupField]?.toString() || '未分类'
    if (!groups[key]) groups[key] = []
    groups[key].push(record)
  })

  doc.setFontSize(16)
  doc.text(table.label + ' - 分组汇总', 40, 40)
  doc.setFontSize(10)
  doc.text(`导出时间: ${new Date().toLocaleString('zh-CN')}`, 40, 60)
  doc.text(`分组字段: ${groupFieldInfo.label}`, 40, 75)
  doc.text(`总记录数: ${records.length}`, 40, 90)

  let currentY = 110

  Object.entries(groups).forEach(([group, groupRecords]) => {
    if (currentY > doc.internal.pageSize.height - 100) {
      doc.addPage()
      currentY = 40
    }

    doc.setFillColor(config?.groupHeaderColor || [243, 244, 246])
    doc.rect(40, currentY, doc.internal.pageSize.width - 80, 30, 'F')
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`${groupFieldInfo.label}: ${group} (${groupRecords.length}条)`, 50, currentY + 20)
    doc.setFont('helvetica', 'normal')
    currentY += 40

    const otherFields = fields.filter(f => f.name !== groupField)
    const headers = ['ID', ...otherFields.map(f => f.label), '状态', '创建时间']
    const body = groupRecords.map((record: any) => {
      const data = record.data as Record<string, any> || {}
      return [
        record.id.toString(),
        ...otherFields.map(f => data[f.name]?.toString() || ''),
        statusText[record.status] || record.status,
        record.createdAt.toLocaleString('zh-CN'),
      ]
    })

    autoTable(doc, {
      head: [headers],
      body: body,
      startY: currentY,
      styles: { fontSize: 8 },
      headStyles: {
        fillColor: config?.headerColor || [59, 130, 246],
        textColor: 255,
      },
      margin: { left: 40, right: 40 },
      didDrawPage: (data) => {
        currentY = data.cursor?.y || currentY
      },
    })

    currentY += 20
  })

  return doc
}

function exportFormPdf(
  table: any,
  fields: any[],
  records: any[],
  config: any
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
  })

  const columnsPerRow = config?.columnsPerRow || 1

  records.forEach((record, recordIdx) => {
    const data = record.data as Record<string, any> || {}

    if (recordIdx > 0) {
      doc.addPage()
    }

    doc.setFontSize(18)
    doc.text(table.label, 40, 50)

    doc.setFontSize(12)
    doc.setTextColor(107, 114, 128)
    doc.text(`记录编号: #${record.id}`, 40, 75)
    doc.text(`状态: ${statusText[record.status] || record.status}`, 300, 75)
    doc.setTextColor(0, 0, 0)

    doc.setDrawColor(229, 231, 235)
    doc.line(40, 90, doc.internal.pageSize.width - 40, 90)

    let currentY = 110
    const colWidth = (doc.internal.pageSize.width - 80 - (columnsPerRow - 1) * 30) / columnsPerRow

    fields.forEach((field, fieldIdx) => {
      const colIdx = fieldIdx % columnsPerRow
      const rowIdx = Math.floor(fieldIdx / columnsPerRow)

      if (colIdx === 0 && rowIdx > 0) {
        currentY += 45
      }

      if (currentY > doc.internal.pageSize.height - 80) {
        doc.addPage()
        currentY = 50
      }

      const x = 40 + colIdx * (colWidth + 30)

      doc.setFillColor(config?.labelBgColor || [249, 250, 251])
      doc.rect(x, currentY, colWidth, 20, 'F')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(field.label, x + 10, currentY + 14)
      doc.setFont('helvetica', 'normal')

      doc.setFillColor(255, 255, 255)
      doc.rect(x, currentY + 20, colWidth, 25, 'FD')
      doc.setFontSize(11)
      doc.text(data[field.name]?.toString() || '-', x + 10, currentY + 36)

      if (config?.showBorder) {
        doc.setDrawColor(229, 231, 235)
        doc.rect(x, currentY, colWidth, 45, 'S')
      }
    })

    const footerY = currentY + 70
    doc.setDrawColor(229, 231, 235)
    doc.line(40, footerY - 20, doc.internal.pageSize.width - 40, footerY - 20)

    doc.setFontSize(10)
    doc.setTextColor(107, 114, 128)
    doc.text(`创建时间: ${record.createdAt.toLocaleString('zh-CN')}`, 40, footerY)
    doc.text(`更新时间: ${record.updatedAt.toLocaleString('zh-CN')}`, 300, footerY)
    doc.setTextColor(0, 0, 0)
  })

  return doc
}
