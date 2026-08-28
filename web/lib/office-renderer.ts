/**
 * 真实文件模板渲染器（ONLYOFFICE 文件化模式）
 * 从 MinIO 取模板文件(docx/xlsx)，替换 {{field}} 占位符后返回 buffer。
 * 不依赖内存模型，合并/公式/样式原样保留。
 */
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
import { getObjectBuffer } from './storage'

/** XML 转义（docx 文本节点） */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** 取字段值（支持 a.b 路径与缺省空串） */
function resolveField(data: any, path: string): string {
  const v = path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), data)
  return v == null ? '' : String(v)
}

/** 在给定文本中替换 {{key}}（key 支持字母数字下划线，或带默认值 {{key|default}}） */
export function fillPlaceholders(text: string, data: any): string {
  return text.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_, key: string) => {
    return escXml(resolveField(data, key))
  })
}

/**
 * 渲染 docx 模板：解包 → 替换 word/document.xml 中 w:t 文本里的 {{field}} → 重新打包
 */
export async function renderDocxTemplate(fileKey: string, data: any): Promise<Buffer> {
  const buf = await getObjectBuffer(fileKey)
  const zip = await JSZip.loadAsync(buf)
  const docEntry = zip.file('word/document.xml')
  if (!docEntry) throw new Error('docx 缺少 word/document.xml')
  let xml = await docEntry.async('string')

  // 只替换 w:t 内的文本（避免碰属性）。用 <w:t...>...</w:t> 包裹替换。
  xml = xml.replace(/(<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/g, (_m, open, text, close) => {
    return open + fillPlaceholders(text, data) + close
  })

  zip.file('word/document.xml', xml)
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

/**
 * 渲染 xlsx 模板：用 exceljs 打开 → 遍历所有 sheet 的单元格，字符串值替换 {{field}}
 */
export async function renderXlsxTemplate(fileKey: string, data: any): Promise<Buffer> {
  const buf = await getObjectBuffer(fileKey)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as any)
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string' && cell.value.includes('{{')) {
          // 逐字段替换（值需先做 Excel 安全转义：防公式注入）
          let v = cell.value.replace(/\{\{([a-zA-Z0-9_.]+)\}\}/g, (_m, key: string) => resolveField(data, key))
          if (v && /^[=+\-@]/.test(v)) v = "'" + v
          cell.value = v
        }
      })
    })
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** 按文件扩展名分派 */
export async function renderTemplateFile(fileKey: string, data: any, kind: 'word' | 'cell'): Promise<Buffer> {
  return kind === 'cell' ? renderXlsxTemplate(fileKey, data) : renderDocxTemplate(fileKey, data)
}