// 单元格数据格式
export interface CellData {
  value: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  bgColor?: string
  textColor?: string
  fontSize?: number
  borderTop?: string
  borderBottom?: string
  borderLeft?: string
  borderRight?: string
  wrapText?: boolean
  textOrientation?: 'horizontal' | 'vertical'
  layoutDirection?: 'vertical' | 'horizontal'
  rowSpan?: number
  colSpan?: number
  mergeHidden?: boolean
  formula?: string
}

// 页面布局设置
export interface PageSetup {
  paperSize: 'A4' | 'A3' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginTop: number
  marginBottom: number
  marginLeft: number
  marginRight: number
  headerMargin: number
  footerMargin: number
  printTitleRows?: string
  printTitleCols?: string
}

export interface RowConfig {
  height: number
}

export interface ColConfig {
  width: number
}

export const DEFAULT_ROWS = 30
export const DEFAULT_COLS = 15
export const FIELD_PATTERN = '\\{\\{[^}]+\\}\\}'

// 列字母标签生成 (A, B, ..., Z, AA, AB...)
export function getColLabel(index: number): string {
  let label = ''
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

// 空单元格工厂
export function emptyCell(): CellData {
  return { value: '' }
}