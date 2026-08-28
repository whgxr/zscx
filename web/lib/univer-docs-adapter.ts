/**
 * RichContent ↔ Univer Docs(IDocumentData) 双向转换。
 * 目的：Word 编辑器画布升级为 Univer Docs 的同时，**存储仍保持 RichContent**（兼容现有 docx
 * 渲染管线），加载时 RichContent→IDocumentData 用于显示，保存时 IDocumentData→RichContent 写回。
 *
 * Univer 老式流模型：body.dataStream（\r\n=段末、\n=节末、表格用 \x1A..\x1F）+ textRuns[{st,ed,ts}]
 * + paragraphs[{startIndex,paragraphStyle}] + tables[{tableId,startIndex,endIndex}] +
 * customBlocks[{startIndex,blockId}] + tableSource[{tableId: ITable}]。行内/段落样式字段与 sheets 的
 * IStyleBase 一致(ff/fs/bl/it/ul/st/cl/bg/va；horizontalAlign/lineSpacing/spaceAbove/spaceBelow/
 * indentFirstLine 用 INumberUnit 或枚举)。
 */

// 行内 → Univer text style
function runToTextStyle(run: any): any {
  const ts: any = {}
  if (run.font) ts.ff = run.font
  if (run.fontSize) ts.fs = run.fontSize
  if (run.bold) ts.bl = 1
  if (run.italic) ts.it = 1
  if (run.underline) ts.ul = { s: 1, t: 0 }
  if (run.strikeThrough) ts.st = { s: 1, t: 0 }
  if (run.color) ts.cl = { rgb: colorToRgb(run.color) }
  if (run.backgroundColor) ts.bg = { rgb: colorToRgb(run.backgroundColor) }
  if (run.subscript) ts.va = 2
  if (run.superscript) ts.va = 3
  return Object.keys(ts).length ? ts : undefined
}

// Univer text style → 行内
function textStyleToRun(ts: any): any {
  if (!ts) return {}
  const r: any = {}
  if (ts.ff) r.font = ts.ff
  if (ts.fs) r.fontSize = ts.fs
  if (ts.bl === 1 || ts.bl === true) r.bold = true
  if (ts.it === 1 || ts.it === true) r.italic = true
  if (ts.ul && (ts.ul.s === 1 || ts.ul.s === true)) r.underline = true
  if (ts.st && (ts.st.s === 1 || ts.st.s === true)) r.strikeThrough = true
  if (ts.cl?.rgb) r.color = '#' + ts.cl.rgb
  if (ts.bg?.rgb) r.backgroundColor = '#' + ts.bg.rgb
  if (ts.va === 3) r.superscript = true
  if (ts.va === 2) r.subscript = true
  return r
}

// #rrggbb/#rgb → 大写 6 位（不带 #）
function colorToRgb(c: string): string | undefined {
  let s = (c || '').trim()
  if (s.startsWith('#')) s = s.slice(1)
  if (s.length === 3) s = s.split('').map((x) => x + x).join('')
  return s.length === 6 ? s.toUpperCase() : undefined
}

const HMap: Record<string, number> = { left: 1, center: 2, right: 3, justify: 4 }
const HRev: Record<number, string> = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify' }

function paraStyleToUniver(style?: any): any {
  if (!style) return undefined
  const p: any = {}
  if (style.align) p.horizontalAlign = HMap[style.align]
  if (style.lineHeight) p.lineSpacing = style.lineHeight
  if (style.spacingBefore) p.spaceAbove = { size: style.spacingBefore, unit: 'pt' }
  if (style.spacingAfter) p.spaceBelow = { size: style.spacingAfter, unit: 'pt' }
  if (style.firstLineIndentCm) p.indentFirstLine = { size: Math.round(style.firstLineIndentCm * 28.35), unit: 'pt' }
  if (style.leftIndentCm) p.indentStart = { size: Math.round(style.leftIndentCm * 28.35), unit: 'pt' }
  if (style.heading) p.headingId = 'Heading' + style.heading
  return Object.keys(p).length ? p : undefined
}

function paraStyleFromUniver(p?: any): any {
  if (!p) return undefined
  const s: any = {}
  if (p.horizontalAlign !== undefined && HRev[p.horizontalAlign]) s.align = HRev[p.horizontalAlign]
  if (p.lineSpacing) s.lineHeight = Math.round(p.lineSpacing * 100) / 100
  if (p.spaceAbove?.size) s.spacingBefore = p.spaceAbove.size
  if (p.spaceBelow?.size) s.spacingAfter = p.spaceBelow.size
  if (p.indentFirstLine?.size) {
    if (p.indentFirstLine.unit === 'cm') s.firstLineIndentCm = p.indentFirstLine.size
    else s.firstLineIndentCm = Math.round((p.indentFirstLine.size / 28.35) * 100) / 100
  }
  if (p.indentStart?.size) s.leftIndentCm = p.indentStart.size / 28.35
  if (p.headingId && /^Heading([1-6])$/.test(p.headingId)) s.heading = Number(p.headingId.slice(-1))
  return Object.keys(s).length ? s : undefined
}

// ============================================================================
// RichContent → IDocumentData
// ============================================================================
export function richContentToUniverDocData(rich: any): any {
  const blocks = Array.isArray(rich.blocks) && rich.blocks.length
    ? rich.blocks
    : (rich.paragraphs ?? []).map((p: any) => ({ type: 'paragraph', runs: p.runs, style: p.style }))

  let dataStream = ''
  const textRuns: any[] = []
  const paragraphs: any[] = []
  const tables: any[] = []
  const customBlocks: any[] = []
  const tableSource: Record<string, any> = {}

  for (const b of blocks) {
    if (b.type === 'table') {
      const tbl = b.table ?? { rows: [] }
      const tableId = 'tbl_' + Math.random().toString(36).slice(2, 8)
      const start = dataStream.length
      dataStream += '\x1A' // table start
      const tableRows: any[] = []
      (tbl.rows ?? []).forEach((row: any, ri: number) => {
        const rowStartIdx = dataStream.length
        dataStream += '\x1B' // row start
        const cells: any[] = []
        ;(row.cells ?? []).forEach((cell: any, ci: number) => {
          const cs = dataStream.length
          dataStream += '\x1C' // cell start
          const cellParas = Array.isArray(cell?.paras) && cell.paras.length
            ? cell.paras
            : (cell?.text ? [{ runs: [{ text: cell.text }] }] : [])
          cellParas.forEach((cp: any) => {
            const st0 = dataStream.length
            ;(cp.runs && cp.runs.length ? cp.runs : [{ text: '' }]).forEach((run: any) => {
              const st = dataStream.length
              dataStream += String(run.text ?? '')
              const ts = runToTextStyle(run)
              if (ts) textRuns.push({ st, ed: st + run.text.length, ts })
              if (cp.style) paragraphs.push({ startIndex: st, paragraphStyle: paraStyleToUniver(cp.style) })
            })
            if (cp.style) paragraphs.push({ startIndex: st0, paragraphStyle: paraStyleToUniver(cp.style) })
            dataStream += '\r\n'
          })
          if (!cellParas.length) dataStream += '\r\n'
          const ce = dataStream.length
          dataStream += '\x1D' // cell end
          const subTableId = tableId + '_c' + ri + '_' + ci
          cells.push({ subTableId, startIndex: cs, endIndex: ce })
          // cell sub-table body（用于渲染单元格内流）
          tableSource[subTableId] = { id: subTableId, rows: [], columns: [] }
        })
        dataStream += '\x1E' // row end
        tableRows.push({ tableRowId: tableId + '_r' + ri, tableCells: cells })
      })
      dataStream += '\x1F' // table end
      const end = dataStream.length
      dataStream += '\r\n'
      tables.push({ tableId, startIndex: start, endIndex: end })
      customBlocks.push({ startIndex: start, blockId: tableId })
      const widths = (tbl.cols ?? []).map((w: number) => ({ storedWidth: Math.round(w), widthType: 0 }))
      tableSource[tableId] = {
        tableId,
        tableRows,
        tableColumns: widths.length ? widths : undefined,
      }
      continue
    }

    const paras = Array.isArray(b.runs) && b.runs.length ? b.runs : [{ text: '' }]
    let absorbed = false
    paras.forEach((run: any) => {
      const st = dataStream.length
      dataStream += String(run.text ?? '')
      const ts = runToTextStyle(run)
      if (ts) textRuns.push({ st, ed: st + String(run.text ?? '').length, ts })
      if (!absorbed) { paragraphs.push({ startIndex: st, paragraphStyle: paraStyleToUniver(b.style) }); absorbed = true }
    })
    dataStream += '\r\n'
  }
  // 节末（最后一个 \r\n 即节末，需要额外空段落标记？保留 dataStream 尾部 \r\n 即可）
  if (!dataStream.endsWith('\r\n')) dataStream += '\r\n'

  return {
    id: 'doc_' + Math.random().toString(36).slice(2, 10),
    body: { dataStream, textRuns, paragraphs, tables, customBlocks },
    tableSource,
    settings: { zoomRatio: 1 },
  }
}

// ============================================================================
// IDocumentData → RichContent
// ============================================================================
export function univerDocDataToRichContent(doc: any): any {
  const body = doc?.body
  if (!body) return { blocks: [{ type: 'paragraph', runs: [{ text: '' }], style: {} }] }

  const blocks: any[] = []
  const dataStream = body.dataStream || ''

  // 表格区域（startIndex,endIndex）
  const tableRanges = (body.tables ?? []).map((t: any) => ({ start: t.startIndex, end: t.endIndex, table: t }))

  // textRuns 按 offset 建索引（注意多个 run 可能重叠，简单起见用段内区间）
  // 对每个段落，在半开区间内扫描 textRuns 求样式
  const runStyleAt = (st: number, ed: number): any[] => {
    const segs: { st: number; ed: number; ts: any }[] = []
    for (const tr of body.textRuns ?? []) {
      if (tr.ed <= st || tr.st >= ed) continue
      segs.push({ st: Math.max(tr.st, st), ed: Math.min(tr.ed, ed), ts: tr.ts })
    }
    segs.sort((a, b) => a.st - b.st)
    return segs
  }

  // 段落边界：dataStream 中每个 \r\n 前的换行位置，或明确记录的 startIndex
  const paraIdx = new Set<number>((body.paragraphs ?? []).map((p: any) => p.startIndex))
  const paraStyles: Record<number, any> = {}
  for (const p of body.paragraphs ?? []) paraStyles[p.startIndex] = p.paragraphStyle

  // 扫描 dataStream 按 \r\n 切分为段；跳过表格控制区
  let cursor = 0
  let cur: { runs: any[]; style: any } | null = null
  const flushPara = () => {
    if (cur && cur.runs.length) { blocks.push({ type: 'paragraph', runs: cur.runs, style: cur.style || {} }); blocks[blocks.length - 1].runs = mergeRuns(cur.runs) }
    cur = null
  }
  while (cursor < dataStream.length) {
    // 若命中表格起点
    const tblHit = tableRanges.find((t: any) => t.start === cursor)
    if (tblHit) {
      flushPara()
      const tbl = buildTableBlock(tblHit, dataStream, body, tableRanges)
      if (tbl) blocks.push(tbl)
      cursor = tblHit.end < dataStream.length ? tblHit.end : tblHit.end + 1
      continue
    }
    const ch = dataStream[cursor]
    if (ch === '\r') {
      flushPara()
      cursor++ // 跳过 \r
      if (dataStream[cursor] === '\n') cursor++ // 跳过 \n
      continue
    }
    if (ch === '\n') { flushPara(); cursor++; continue }
    // 控制字符（表格内部已跳过，这里忽略其余单字符控制符）
    if (ch === '\x1A' || ch === '\x1B' || ch === '\x1C' || ch === '\x1D' || ch === '\x1E' || ch === '\x1F') { cursor++; continue }
    // 找本段结尾（下一个 \r 或 \n）
    let ed = cursor
    while (ed < dataStream.length && dataStream[ed] !== '\r' && dataStream[ed] !== '\n' && !tableRanges.some((t: any) => t.start === ed)) ed++
    const segs = runStyleAt(cursor, ed)
    if (!cur) cur = { runs: [], style: paraStyleFromUniver(paraStyles[cursor]) || {} }
    let segSt = cursor
    for (const seg of segs) {
      if (seg.st > segSt) {
        const txt = dataStream.slice(segSt, seg.st)
        if (txt) pushRun(cur, txt, {})
        segSt = seg.st
      }
      if (seg.ed > segSt) {
        const txt = dataStream.slice(segSt, seg.ed)
        if (txt) pushRun(cur, txt, textStyleToRun(seg.ts))
        segSt = seg.ed
      }
    }
    if (segSt < ed) { const txt = dataStream.slice(segSt, ed); if (txt) pushRun(cur, txt, {}) }
    cursor = ed
  }
  flushPara()
  if (!blocks.length) blocks.push({ type: 'paragraph', runs: [{ text: '' }], style: {} })

  const paragraphs = blocks.filter((b) => b.type === 'paragraph')
  return { blocks, paragraphs }
}

function pushRun(cur: any, text: string, style: any) {
  const run: any = { text, ...style }
  const last = cur.runs[cur.runs.length - 1]
  const same = last && last.text === '' ? false : last && JSON.stringify(last) === JSON.stringify(run)
  if (last && same) last.text += text
  else cur.runs.push(run)
}

function mergeRuns(runs: any[]): any[] {
  const out: any[] = []
  for (const r of runs) {
    const last = out[out.length - 1]
    const same = last && JSON.stringify(last) === JSON.stringify(r)
    if (last && same) last.text += r.text
    else out.push({ ...r })
  }
  return out
}

function buildTableBlock(tblHit: any, dataStream: string, body: any, tableRanges: any[]): any | null {
  const table = tblHit.table
  const tableSrc = body?.tableSource?.[table.tableId]
  if (!tableSrc?.tableRows) return null

  const rows: any[] = []
  const cellRangeToText = (cid: number, index: number): string => {
    const src = body?.tableSource?.[index]
    void src
    return ''
  }
  void cellRangeToText

  for (const row of tableSrc.tableRows) {
    const cells: any[] = []
    for (const cell of row.tableCells ?? []) {
      // 子表 subTableId 的 body 流：通过 body.customRanges? 无；这里用全表起始到 cell.endIndex 不可靠。
      // 简单方案：取 dataStream[cell.startIndex..cell.endIndex) 并去除控制字符，作为纯文本单元格。
      const raw = dataStream.slice(cell.startIndex, cell.endIndex)
      let txt = ''
      for (let i = 0; i < raw.length; i++) {
        const c = raw[i]
        if (c === '\r') { txt += (raw[i + 1] === '\n' ? '\n' : '\n'); if (raw[i + 1] === '\n') i++; continue }
        if ('\x01\x1A\x1B\x1C\x1D\x1E\x1F\x00'.includes(c)) continue
        txt += c
      }
      const paras = txt.split('\n').filter((s) => s !== '').map((s) => ({ runs: [{ text: s.replace(/\x0B|\x0C/g, '') }], style: {} }))
      cells.push(paras.length ? { paras } : { paras: [{ runs: [{ text: '' }], style: {} }] })
    }
    rows.push({ cells })
  }
  return rows.length ? { type: 'table', table: { rows } } : null
}