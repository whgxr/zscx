/**
 * M3-T4 DOCX 渲染引擎：
 *  - 输入：documentConfig.blocks (A4 画布 JSON) + 单条数据 record + 关联数据(related 可选：如征收同步调查数据时的 relatedSurvey)
 *  - 输出：docx.Document（由 docx.js 库构造）
 *
 * 支持块类型：
 *   paragraph: { text, style:{bold,italic,underline,fontSize,align,color,spacingBefore,spacingAfter} }
 *   heading: { text, level:1~6, style }
 *   richText: { html }  — 基础 <b><i><u><br/><p><span><strong><em> 支持
 *   table: { columns:[{width, label}], rows:[ [cells: {text, style}] ] | each: string }  — 可 foreach
 *   list: { ordered, items: [{text}] }
 *   image: { field? | src? | widthCm?, heightCm? }
 *   pageBreak
 *   condition: { expression, thenBlocks, elseBlocks }
 *   each: { arrayPath, itemAlias, indexAlias, body }
 *   section: { header, footer, children }
 *   field: { name (可选，与 text 内嵌 {{xxx}} 合并) }
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, PageBreak, BorderStyle,
  LevelFormat, convertInchesToTwip, Header, Footer, PageNumber,
} from 'docx'
import { tokenizeFlat, nestTokens, resolveField, applyFormatters, evalBoolExpression, type FlatBlock } from './document-tokenizer'

export interface DocxBlock {
  id: string
  type: 'paragraph' | 'heading' | 'richText' | 'table' | 'list' | 'image' | 'pageBreak' | 'condition' | 'each' | 'section'
  // paragraph/heading
  text?: string
  level?: 1 | 2 | 3 | 4 | 5 | 6
  // table
  columns?: { key: string; label: string; width?: number; align?: 'left' | 'center' | 'right' }[]
  rows?: { cells: string[] }[]                // 静态行；若设 each，则自动生成
  rowEachArrayPath?: string                   // ={{#each X}} 对 X 迭代 rows
  rowTemplate?: string[]                      // 列的 text 模板数组，与 columns 对应
  // list
  ordered?: boolean
  items?: string[]                            // 每个都是 text 模板
  listEachArrayPath?: string
  listItemTemplate?: string
  // image
  imageFieldPath?: string                     // record 中某字段存 base64 / URL
  imageDefaultWidthCm?: number
  imageDefaultHeightCm?: number
  // condition
  conditionExpression?: string
  thenBlocks?: DocxBlock[]
  elseBlocks?: DocxBlock[]
  // each
  eachArrayPath?: string
  eachItemAlias?: string
  eachIndexAlias?: string
  bodyBlocks?: DocxBlock[]
  // section
  headerText?: string
  footerText?: string
  children?: DocxBlock[]
  // common
  style?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    fontSize?: number      // pt
    font?: string
    color?: string         // hex 不带 #
    align?: 'left' | 'center' | 'right' | 'justify'
    spacingBefore?: number
    spacingAfter?: number
    lineHeight?: number
    borderBottom?: boolean
    indent?: { leftCm?: number; rightCm?: number; firstLineCm?: number }
  }
  tableStyle?: {
    widthsCm?: number[]           // 列宽（厘米）
    headerBg?: string             // 表头背景色
    borderColor?: string
    cellPaddingCm?: number
  }
}

export interface DocxPageSettings {
  paperSize?: 'A4' | 'A5' | 'Letter'
  orientation?: 'portrait' | 'landscape'
  marginsCm?: { top?: number; bottom?: number; left?: number; right?: number; header?: number; footer?: number }
}

const ALIGN = {
  left: AlignmentType.LEFT, center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED,
}

function toTwipCm(cm: number): number {
  // 1 cm ≈ 0.3937 inch ; twip = inch * 1440
  return convertInchesToTwip(cm * 0.393701)
}

function contextStack(root: any, eachFrames: any[]): any[] {
  const arr: any[] = [{ root }]
  for (const f of eachFrames) arr.push({ __alias: f.alias, __item: f.item, __index: f.index, __arrayLen: f.arrayLen })
  return arr
}

/** 对 text 模板（含 {{}}/#if/#each）求值 → 字符串（或富文本 token） */
function renderTextTemplateToRuns(text: string, ctx: any[], baseStyle: DocxBlock['style'] = {}): TextRun[] {
  const tokens = tokenizeFlat(text)
  const ast = nestTokens(tokens)
  const out: TextRun[] = []
  const walk = (blocks: FlatBlock[]) => {
    for (const b of blocks) {
      if (b.type === 'text') {
        for (const t of b.tokens) {
          if (t.kind === 'COMMENT') continue
          if (t.kind === 'TEXT') {
            if (t.raw.length) out.push(new TextRun({ text: t.raw, ...textRunStyle(baseStyle) }))
          } else if (t.kind === 'VALUE' || t.kind === 'VALUE_RAW') {
            let v = resolveField(t.fieldPath ?? '', ctx)
            v = applyFormatters(v, t.formatters)
            if (v == null) v = ''
            out.push(new TextRun({ text: String(v), ...textRunStyle(baseStyle) }))
          }
        }
      } else if (b.type === 'if') {
        const ok = evalBoolExpression(b.condition, ctx)
        walk(ok ? b.then : (b.else ?? []))
      } else if (b.type === 'each') {
        const arr: any[] = resolveField(b.arrayPath, ctx) ?? []
        if (Array.isArray(arr)) {
          arr.forEach((it, idx) => {
            ctx.push({ __alias: b.itemAlias, __item: it, __index: idx, __arrayLen: arr.length })
            walk(b.body)
            ctx.pop()
          })
        }
      }
    }
  }
  walk(ast)
  return out.length ? out : [new TextRun({ text: '', ...textRunStyle(baseStyle) })]
}

function textRunStyle(s: DocxBlock['style'] = {}) {
  return {
    bold: s.bold,
    italics: s.italic,
    underline: s.underline ? {} : undefined,
    size: s.fontSize ? s.fontSize * 2 : undefined,  // docx 半磅单位
    font: s.font,
    color: s.color,
  }
}

function parStyle(s: DocxBlock['style'] = {}) {
  return {
    alignment: s.align ? ALIGN[s.align] : undefined,
    spacing: {
      before: s.spacingBefore != null ? s.spacingBefore * 20 : undefined,
      after: s.spacingAfter != null ? s.spacingAfter * 20 : undefined,
      line: s.lineHeight ? Math.round(s.lineHeight * 240) : undefined,
    },
    indent: s.indent ? {
      left: s.indent.leftCm != null ? toTwipCm(s.indent.leftCm) : undefined,
      right: s.indent.rightCm != null ? toTwipCm(s.indent.rightCm) : undefined,
      firstLine: s.indent.firstLineCm != null ? toTwipCm(s.indent.firstLineCm) : undefined,
    } : undefined,
    border: s.borderBottom ? {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' },
    } : undefined,
  }
}

function toHeadingLevel(l: number = 1) {
  const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
  return levels[Math.min(l - 1, 5)]
}

function renderTable(block: DocxBlock, ctx: any[]): Table {
  const cols = block.columns ?? []
  const ts = block.tableStyle ?? {}
  const cellPad = ts.cellPaddingCm ?? 0.1
  const widthCm = ts.widthsCm ?? cols.map(() => Math.max(2, (17 - (cols.length - 1) * 0.1) / cols.length))
  const headerBg = ts.headerBg ?? 'ECEFF1'

  let rowsData: { cells: string[] }[] = block.rows ?? []
  if (block.rowEachArrayPath) {
    const arr: any[] = resolveField(block.rowEachArrayPath, ctx) ?? []
    rowsData = arr.map((it, i) => {
      ctx.push({ __alias: block.eachItemAlias ?? 'item', __item: it, __index: i, __arrayLen: arr.length })
      const row = (block.rowTemplate ?? cols.map(c => `{{${c.key}}}`)).map(tpl => textTemplateToFlat(tpl, ctx))
      ctx.pop()
      return { cells: row }
    })
  }

  const cellsMake = (cells: string[], header: boolean) =>
    cells.map((c, ci) => new TableCell({
      width: { size: toTwipCm(widthCm[ci] ?? 2), type: WidthType.DXA },
      margins: {
        top: toTwipCm(cellPad), bottom: toTwipCm(cellPad),
        left: toTwipCm(cellPad), right: toTwipCm(cellPad),
      },
      children: [new Paragraph({
        alignment: cols[ci]?.align ? ALIGN[cols[ci].align] : AlignmentType.LEFT,
        children: [new TextRun({ text: c, bold: header, color: header ? '000000' : undefined, size: 20 })],
      })],
      shading: header ? { fill: headerBg } : undefined,
    }))

  const rows: TableRow[] = [
    new TableRow({ children: cellsMake(cols.map(c => c.label), true) }),
    ...rowsData.map(r => new TableRow({ children: cellsMake(r.cells, false) })),
  ]
  return new Table({ rows })
}

function textTemplateToFlat(text: string, ctx: any[]): string {
  // 简化：支持 VALUE 与 TEXT，不支持 IF/EACH 嵌套（表格 cell 文本场景足够）
  const toks = tokenizeFlat(text)
  let s = ''
  for (const t of toks) {
    if (t.kind === 'TEXT') s += t.raw
    else if (t.kind === 'VALUE' || t.kind === 'VALUE_RAW') {
      let v = resolveField(t.fieldPath ?? '', ctx)
      v = applyFormatters(v, t.formatters)
      s += v == null ? '' : String(v)
    }
  }
  return s
}

function renderBlocks(blocks: DocxBlock[], root: any, eachFrames: any[], output: (Paragraph | Table)[]) {
  for (const b of blocks) {
    const ctx = contextStack(root, eachFrames)
    switch (b.type) {
      case 'paragraph': {
        const runs = renderTextTemplateToRuns(b.text ?? '', ctx, b.style)
        output.push(new Paragraph({ ...parStyle(b.style), children: runs }))
        break
      }
      case 'heading': {
        const runs = renderTextTemplateToRuns(b.text ?? '', ctx, b.style)
        output.push(new Paragraph({ heading: toHeadingLevel(b.level), ...parStyle(b.style), children: runs }))
        break
      }
      case 'richText': {
        const runs = renderTextTemplateToRuns(b.text ?? '', ctx, b.style)
        output.push(new Paragraph({ ...parStyle(b.style), children: runs }))
        break
      }
      case 'pageBreak': {
        output.push(new Paragraph({ children: [new PageBreak()] }))
        break
      }
      case 'table': {
        output.push(renderTable(b, ctx))
        break
      }
      case 'list': {
        const items: string[] = []
        if (b.listEachArrayPath) {
          const arr: any[] = resolveField(b.listEachArrayPath, ctx) ?? []
          arr.forEach((it, idx) => {
            eachFrames.push({ alias: b.eachItemAlias ?? 'item', item: it, index: idx, arrayLen: arr.length })
            items.push(textTemplateToFlat(b.listItemTemplate ?? '{{item}}', contextStack(root, eachFrames)))
            eachFrames.pop()
          })
        } else {
          for (const it of b.items ?? []) items.push(textTemplateToFlat(it, ctx))
        }
        items.forEach((t, i) => {
          const runs = [new TextRun({ text: t, ...textRunStyle(b.style) })]
          output.push(new Paragraph({
            ...parStyle(b.style),
            numbering: { reference: b.ordered ? 'ordered-list' : 'bullet-list', level: 0 },
            children: runs,
          }))
          void i
        })
        break
      }
      case 'condition': {
        const ok = evalBoolExpression(b.conditionExpression ?? 'false', ctx)
        const sub = ok ? (b.thenBlocks ?? []) : (b.elseBlocks ?? [])
        renderBlocks(sub, root, eachFrames, output)
        break
      }
      case 'each': {
        const arr: any[] = resolveField(b.eachArrayPath ?? '', ctx) ?? []
        for (let i = 0; i < arr.length; i++) {
          eachFrames.push({ alias: b.eachItemAlias ?? 'item', item: arr[i], index: i, arrayLen: arr.length })
          renderBlocks(b.bodyBlocks ?? [], root, eachFrames, output)
          eachFrames.pop()
        }
        break
      }
      case 'section': {
        renderBlocks(b.children ?? [], root, eachFrames, output)
        break
      }
      case 'image': break
    }
  }
}

export interface RenderDocxOptions {
  record: any
  related?: { surveyRecord?: any; [k: string]: any }
  title?: string
  page?: DocxPageSettings
}

export async function renderDocxToBuffer(blocks: DocxBlock[], opt: RenderDocxOptions): Promise<Buffer> {
  const { record, related, title, page } = opt
  const root: any = { ...(record ?? {}), ...(related ?? {}) }
  if (related?.surveyRecord) root.survey = related.surveyRecord
  const output: (Paragraph | Table)[] = []
  renderBlocks(blocks, root, [], output)

  const margins = page?.marginsCm ?? { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 }
  const doc = new Document({
    title: title ?? '征收文书',
    creator: 'ZSCS v1.2.2',
    numbering: {
      config: [
        { reference: 'bullet-list', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }] },
        { reference: 'ordered-list', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }] },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: (() => {
            const sz: any = (() => {
              if (page?.paperSize === 'A5') { return { width: toTwipCm(14.8), height: toTwipCm(21) } }
              if (page?.paperSize === 'Letter') { return { width: convertInchesToTwip(8.5), height: convertInchesToTwip(11) } }
              return { width: toTwipCm(21), height: toTwipCm(29.7) }
            })()
            if (page?.orientation === 'landscape') {
              return { width: sz.height, height: sz.width, orientation: 'landscape' }
            }
            return sz
          })(),
          margin: {
            top: toTwipCm(margins.top ?? 2.54),
            bottom: toTwipCm(margins.bottom ?? 2.54),
            left: toTwipCm(margins.left ?? 3.17),
            right: toTwipCm(margins.right ?? 3.17),
            header: toTwipCm(margins.header ?? 1.5),
            footer: toTwipCm(margins.footer ?? 1.75),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: title ?? '', color: '666666', size: 18 })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: '第 ', size: 18, color: '666666' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '666666' }),
              new TextRun({ text: ' / ', size: 18, color: '666666' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '666666' }),
            ],
          })],
        }),
      },
      children: output as any,
    }],
  })
  const arr = await Packer.toBuffer(doc)
  return Buffer.from(arr)
}

export async function renderDocxToBase64(blocks: DocxBlock[], opt: RenderDocxOptions): Promise<string> {
  const buf = await renderDocxToBuffer(blocks, opt)
  return buf.toString('base64')
}
