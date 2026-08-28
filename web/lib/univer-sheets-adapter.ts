/**
 * Univer Sheets 快照(IWorkbookData) ↔ 旧版 CellData 网格 双向转换。
 *
 * 目的：模板存储格式升级为 Univer 原生快照(config.univerData)，同时后端 excel/pdf
 * 渲染管线不动（它们已内置 univerData→grid 转换）。
 *
 * 枚举值取自 @univerjs/core：
 *   HorizontalAlign: LEFT=1 CENTER=2 RIGHT=3
 *   VerticalAlign:   TOP=1 MIDDLE=2 BOTTOM=3
 *   WrapStrategy:    WRAP=3
 *   FontWeight:      bold = bl: BooleanNumber(1)
 */

// ---- 旧版网格结构（与 types/cell-data.ts 的 CellData 对应） ----
export interface LegacyCell {
  value?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number
  bgColor?: string   // '#rrggbb'
  textColor?: string // '#rrggbb'
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  wrapText?: boolean
  textOrientation?: 'horizontal' | 'vertical'
  borderTop?: string
  borderBottom?: string
  borderLeft?: string
  borderRight?: string
  formula?: string
  rowSpan?: number
  colSpan?: number
  mergeHidden?: boolean
}
export interface LegacyGridConfig {
  grid?: LegacyCell[][]
  rowHeights?: number[]
  colWidths?: number[]
  pageSetup?: any
}

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

/** 颜色 #rrggbb/#rgb → 6 位 rgb 十六进制大写（不带 #） */
function toRgbHex(color?: string): string | undefined {
  if (!color) return undefined
  let c = color.trim()
  if (c.startsWith('#')) c = c.slice(1)
  if (c.length === 3) c = c.split('').map((x) => x + x).join('')
  if (c.length === 6) return c.toUpperCase()
  return undefined
}

/** 取单元格文本：优先 formula（前端存 =式），否则 value */
function cellText(cell: LegacyCell): string {
  if (cell.formula) return cell.formula
  return cell.value == null ? '' : String(cell.value)
}

const hasBorder = (cell: LegacyCell) =>
  !!(cell.borderTop || cell.borderBottom || cell.borderLeft || cell.borderRight)

/** 由单元格构建 Univer 样式对象 */
function buildStyle(cell: LegacyCell): any | undefined {
  const hasStyle =
    cell.bold || cell.italic || cell.underline || cell.fontSize != null ||
    cell.bgColor || cell.textColor || cell.align || cell.verticalAlign ||
    cell.wrapText || hasBorder(cell)
  if (!hasStyle) return undefined

  const s: any = {}
  if (cell.bold) s.bl = 1
  if (cell.italic) s.it = 1
  if (cell.underline) s.ul = { s: 1, t: 0 }
  if (cell.fontSize != null) s.fs = cell.fontSize
  if (cell.bgColor) s.bg = { rgb: toRgbHex(cell.bgColor) }
  if (cell.textColor) s.cl = { rgb: toRgbHex(cell.textColor) }
  if (cell.align) s.ht = cell.align === 'center' ? 2 : cell.align === 'right' ? 3 : 1
  if (cell.verticalAlign) s.vt = cell.verticalAlign === 'middle' ? 2 : cell.verticalAlign === 'bottom' ? 3 : 1
  if (cell.wrapText) s.tb = 3
  if (hasBorder(cell)) {
    s.bd = {
      t: cell.borderTop ? { s: 1 } : undefined,
      r: cell.borderRight ? { s: 1 } : undefined,
      b: cell.borderBottom ? { s: 1 } : undefined,
      l: cell.borderLeft ? { s: 1 } : undefined,
    }
  }
  return s
}

/** 样式去重：以 JSON 为键返回去重后索引 */
function styleIndexer(styles: Record<string, any>) {
  const cache: Record<string, number> = {}
  return {
    get(cell: LegacyCell): number | undefined {
      const s = buildStyle(cell)
      if (!s) return undefined
      const key = JSON.stringify(s)
      if (cache[key] != null) return cache[key]
      const idx = Object.keys(styles).length
      styles[idx] = s
      cache[key] = idx
      return idx
    },
  }
}

/**
 * 旧版网格 → Univer IWorkbookData 快照。
 * 结构与后端 exportTemplateExcel 读取的 univerData 对齐：
 * { id, sheetOrder:[id], sheets:{[id]:{id,name,rowCount,columnCount,defaultColumnWidth,
 *   defaultRowHeight,cellData,colData,rowData,mergeData}}, styles }
 */
export function legacyGridToWorkbookData(cfg: LegacyGridConfig): any {
  const grid = cfg.grid || []
  const rowHeights = cfg.rowHeights || []
  const colWidths = cfg.colWidths || []

  const maxRow = grid.length
  const maxCol = grid[0]?.length || 0

  const cellData: Record<string, Record<string, any>> = {}
  const colData: Record<string, any> = {}
  const rowData: Record<string, any> = {}
  const mergeData: any[] = []
  const styles: Record<string, any> = {}
  const idxer = styleIndexer(styles)

  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const cell = grid[r]?.[c]
      if (!cell || cell.mergeHidden) continue
      const rc = cellData[r] || (cellData[r] = {})
      const univerCell: any = {}
      const text = cellText(cell)
      if (cell.formula) univerCell.f = cell.formula.replace(/^=/, '')
      univerCell.v = text
      const sIdx = idxer.get(cell)
      if (sIdx != null) univerCell.s = sIdx
      rc[c] = univerCell
    }
  }

  for (let c = 0; c < maxCol && c < colWidths.length; c++) {
    const w = colWidths[c]
    if (w != null && w > 0) colData[c] = { w }
  }
  for (let r = 0; r < maxRow && r < rowHeights.length; r++) {
    const h = rowHeights[r]
    if (h != null && h > 0) rowData[r] = { h }
  }
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const cell = grid[r]?.[c]
      if (!cell) continue
      const rs = cell.rowSpan || 1
      const cs = cell.colSpan || 1
      if (rs <= 1 && cs <= 1) continue
      mergeData.push({ startRow: r, startColumn: c, endRow: r + rs - 1, endColumn: c + cs - 1 })
    }
  }

  const sheetId = 'sheet-' + uid()
  return {
    id: 'workbook-' + uid(),
    sheetOrder: [sheetId],
    sheets: {
      [sheetId]: {
        id: sheetId,
        name: 'Sheet1',
        rowCount: Math.max(1, maxRow),
        columnCount: Math.max(1, maxCol),
        defaultColumnWidth: 100,
        defaultRowHeight: 24,
        cellData,
        colData,
        rowData,
        mergeData,
      },
    },
    styles,
    app: {},
  }
}

/**
 * Univer IWorkbookData 快照 → 旧版网格（含 rowHeights/colWidths）。
 * 与后端 exportTemplateExcel 的 univerData→grid 逻辑一致。
 */
export function workbookDataToLegacyGrid(univerData: any): LegacyGridConfig {
  const grid: LegacyCell[][] = []
  if (!univerData || !univerData.sheetOrder?.length) {
    return { grid, rowHeights: [], colWidths: [] }
  }
  const sheet = univerData.sheets?.[univerData.sheetOrder[0]]
  if (!sheet) return { grid, rowHeights: [], colWidths: [] }

  const cellData = sheet.cellData || {}
  const styles: Record<string, any> = univerData.styles || {}
  const merges = sheet.mergeData || []

  let maxRow = sheet.rowCount || 50
  let maxCol = sheet.columnCount || 20
  for (const rRaw of Object.keys(cellData)) {
    const r = Number(rRaw)
    if (r >= maxRow) maxRow = r + 1
    const row = cellData[rRaw]
    if (row) {
      for (const cRaw of Object.keys(row)) {
        const c = Number(cRaw)
        if (c >= maxCol) maxCol = c + 1
      }
    }
  }

  const mergeMap: Record<string, { rowSpan: number; colSpan: number }> = {}
  const mergeHidden = new Set<string>()
  for (const m of merges) {
    if (m.startRow !== undefined) {
      const key = `${m.startRow},${m.startColumn}`
      mergeMap[key] = { rowSpan: m.endRow - m.startRow + 1, colSpan: m.endColumn - m.startColumn + 1 }
      for (let r = m.startRow; r <= m.endRow; r++)
        for (let c = m.startColumn; c <= m.endColumn; c++)
          if (!(r === m.startRow && c === m.startColumn)) mergeHidden.add(`${r},${c}`)
    }
  }

  for (let r = 0; r < maxRow; r++) {
    grid[r] = []
    for (let c = 0; c < maxCol; c++) {
      const univerCell = sheet.cellData[r]?.[c]
      const key = `${r},${c}`
      const merge = mergeMap[key]
      const mh = mergeHidden.has(key)
      if (!univerCell && !merge && !mh) continue
      const style = univerCell?.s !== undefined ? styles[String(univerCell.s)] : undefined
      grid[r][c] = {
        value: univerCell?.v != null ? String(univerCell.v) : (univerCell?.f ? '=' + univerCell.f : ''),
        formula: univerCell?.f ? '=' + univerCell.f : undefined,
        bold: cellToBool(style?.bl),
        italic: style?.it === 1 || style?.it === true,
        underline: style?.ul?.s === 1 || style?.ul?.s === true,
        align: style?.ht === 2 ? 'center' : style?.ht === 3 ? 'right' : 'left',
        verticalAlign: style?.vt === 2 ? 'middle' : style?.vt === 3 ? 'bottom' : 'top',
        bgColor: style?.bg?.rgb ? `#${style.bg.rgb}` : undefined,
        textColor: style?.cl?.rgb ? `#${style.cl.rgb}` : undefined,
        fontSize: style?.fs,
        wrapText: style?.tb === 3 || style?.tb === 2,
        rowSpan: merge?.rowSpan,
        colSpan: merge?.colSpan,
        mergeHidden: mh || undefined,
      }
    }
  }

  const colD = sheet.colData || {}
  const colWidths: number[] = []
  for (let c = 0; c < maxCol; c++) colWidths[c] = colD[c]?.w || sheet.defaultColumnWidth || 100
  const rowD = sheet.rowData || {}
  const rowHeights: number[] = []
  for (let r = 0; r < maxRow; r++) rowHeights[r] = rowD[r]?.h || sheet.defaultRowHeight || 24

  return { grid, rowHeights, colWidths }
}

/** 兼容 BooleanNumber(0/1)/布尔/对象 多种写法 */
function cellToBool(v: any): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1
  if (v && typeof v === 'object' && 'rgb' in v) {
    // 后端旧写法把 bd(边框) 当加粗标记
    return true
  }
  return false
}