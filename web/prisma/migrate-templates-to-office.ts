/**
 * 一次性迁移：ExportTemplate 老模板 → ONLYOFFICE 文件化模板（落 MinIO，更新 fileKey）
 * - WORD 模板(documentConfig.content) → renderRichDocxToBuffer 生成 docx 保存
 * - Excel 类模板(config.grid/univerData) → exceljs 生成 xlsx 保存
 * 幂等：已有对应 fileKey 的模板跳过。
 * 运行：cd web && npx tsx prisma/migrate-templates-to-office.ts
 */
import { PrismaClient } from '@prisma/client'
import ExcelJS from 'exceljs'
import { saveObject, buildObjectKey, objectExists } from '../lib/storage'
import { renderRichDocxToBuffer } from '../lib/docx-renderer'

const prisma = new PrismaClient()

/** 网格(CellData) → exceljs：值 + 合并 + 列宽/行高 + 基础样式 */
async function gridToXlsx(grid: any[], rowHeights?: any, colWidths?: any): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sheet1')
  const rh = Array.isArray(rowHeights) ? rowHeights : []
  const cw = Array.isArray(colWidths) ? colWidths : []
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      const cell = grid[r][c]
      if (!cell || cell.mergeHidden) continue
      const row = ws.getRow(r + 1)
      const xcell = row.getCell(c + 1)
      xcell.value = cell.value ?? ''
      if (cell.bold) xcell.font = { ...xcell.font, bold: true }
      if (cell.fontSize) xcell.font = { ...xcell.font, size: cell.fontSize }
      if (cell.align) xcell.alignment = { ...xcell.alignment, horizontal: cell.align }
      if (cell.verticalAlign) xcell.alignment = { ...xcell.alignment, vertical: cell.verticalAlign }
      if (cell.wrapText) xcell.alignment = { ...xcell.alignment, wrapText: true }
      if (cell.bgColor) xcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + cell.bgColor.replace('#', '') } }
      // 合并
      const rs = cell.rowSpan || 1
      const cs = cell.colSpan || 1
      if (rs > 1 || cs > 1) {
        ws.mergeCells(r + 1, c + 1, r + rs, c + cs)
      }
    }
  }
  rh.forEach((h: number, i: number) => { if (h > 0) ws.getRow(i + 1).height = h })
  cw.forEach((w: number, i: number) => { if (w > 0) ws.getColumn(i + 1).width = w / 7 })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** documentConfig 可能是字符串（JSON）或对象 */
function normContent(dc: any): any {
  if (!dc) return null
  const obj = typeof dc === 'string' ? (() => { try { return JSON.parse(dc) } catch { return null } })() : dc
  return obj?.content || null
}

async function migrateOne(tpl: any) {
  let changed = false
  // WORD
  if (tpl.type === 'WORD' && !tpl.documentFileKey) {
    const content = normContent(tpl.documentConfig)
    if (content) {
      const buf = await renderRichDocxToBuffer(content, {
        record: {}, related: null, title: tpl.name || '模板',
        page: { paperSize: tpl.paperSize || 'A4', orientation: tpl.orientation || 'portrait' },
      })
      const key = buildObjectKey(`templates/${tpl.id}`, `template-${Date.now()}.docx`)
      await saveObject(key, buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      await prisma.exportTemplate.update({ where: { id: tpl.id }, data: { documentFileKey: key } })
      console.log(`  ✓ WORD #${tpl.id} ${tpl.name} -> ${key}`)
      changed = true
    }
  }
  // Excel 类
  if (tpl.type !== 'WORD' && !tpl.spreadsheetFileKey) {
    const cfg = tpl.config || {}
    const grid = Array.isArray(cfg.grid) ? cfg.grid : null
    if (grid) {
      const buf = await gridToXlsx(grid, cfg.rowHeights, cfg.colWidths)
      const key = buildObjectKey(`templates/${tpl.id}`, `template-${Date.now()}.xlsx`)
      await saveObject(key, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      await prisma.exportTemplate.update({ where: { id: tpl.id }, data: { spreadsheetFileKey: key } })
      console.log(`  ✓ EXCEL #${tpl.id} ${tpl.name} -> ${key}`)
      changed = true
    }
  }
  return changed
}

async function main() {
  const templates = await prisma.exportTemplate.findMany({ orderBy: { id: 'asc' } })
  console.log(`共 ${templates.length} 个模板`)
  let moved = 0
  for (const tpl of templates) {
    try {
      if (await migrateOne(tpl)) moved++
    } catch (e: any) {
      console.error(`  ✗ #${tpl.id} ${tpl.name}: ${e.message}`)
    }
  }
  console.log(`\n完成：迁移 ${moved} 个模板`)
  await prisma.$disconnect()
}

main().catch(async (e) => { console.error('❌', e); await prisma.$disconnect(); process.exit(1) })