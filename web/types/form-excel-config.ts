import { CellData, PageSetup, emptyCell } from './cell-data'

// 子表配置
export interface SubTableConfig {
  detailTableId: number
  detailTableName: string
  label: string
  fields: string[]  // 子表显示字段名列表
  minRows?: number
  maxRows?: number
}

// 表单设计器新配置格式
export interface FormExcelConfig {
  grid: CellData[][]
  rowHeights: number[]
  colWidths: number[]
  pageSetup: PageSetup
  subTables: SubTableConfig[]
  defaultFontSize?: number
  defaultRowHeight?: number
}

// 默认页面设置
export function defaultPageSetup(): PageSetup {
  return {
    paperSize: 'A4',
    orientation: 'portrait',
    marginTop: 20,
    marginBottom: 20,
    marginLeft: 15,
    marginRight: 15,
    headerMargin: 10,
    footerMargin: 10,
  }
}

// 默认列宽
export const DEFAULT_FORM_COL_WIDTHS = [120, 200, 120, 200]

// 默认表单配置
export function defaultFormExcelConfig(): FormExcelConfig {
  return {
    grid: [
      Array.from({ length: 4 }, () => ({ value: '' })),
    ],
    rowHeights: [32],
    colWidths: [...DEFAULT_FORM_COL_WIDTHS],
    pageSetup: defaultPageSetup(),
    subTables: [],
    defaultFontSize: 13,
    defaultRowHeight: 32,
  }
}

// 从旧版 FormLayoutConfig 迁移到 FormExcelConfig
export function migrateFormLayoutToExcel(
  oldConfig: any | null | undefined
): FormExcelConfig {
  if (!oldConfig) {
    return defaultFormExcelConfig()
  }

  // 检查是否已经是新版格式
  if ('grid' in oldConfig && Array.isArray(oldConfig.grid)) {
    return oldConfig as FormExcelConfig
  }

  // 旧版 FormLayoutConfig 格式
  const groups = oldConfig.groups || []
  if (groups.length === 0) {
    return defaultFormExcelConfig()
  }

  const grid: CellData[][] = []
  const rowHeights: number[] = []
  let colWidths = [...DEFAULT_FORM_COL_WIDTHS]
  const subTables: SubTableConfig[] = []

  for (const group of groups) {
    // 分组标题行
    if (group.title) {
      const cols = group.columns || 4
      const titleRow: CellData[] = [{
        value: group.title,
        bold: true,
        fontSize: 14,
        align: 'center',
        bgColor: '#EFF6FF',
        colSpan: cols,
      }]
      // 补齐被 colSpan 覆盖的列
      for (let i = 1; i < cols; i++) {
        titleRow.push({ value: '', mergeHidden: true })
      }
      grid.push(titleRow)
      rowHeights.push(36)
    }

    // 列宽
    if (group.colWidths && group.colWidths.length > 0) {
      colWidths = [...group.colWidths]
    }

    // 新版 rows 格式
    if (group.rows && group.rows.length > 0) {
      for (const row of group.rows) {
        const excelRow: CellData[] = []
        for (const cell of row) {
          if (cell.fieldId != null && cell.fieldName) {
            const cs = cell.colSpan || 1
            const rs = cell.rowSpan || 1
            excelRow.push({
              value: `${cell.fieldName}：{{${cell.fieldName}}}`,
              fontSize: cell.fontSize || 13,
              colSpan: cs > 1 ? cs : undefined,
              rowSpan: rs > 1 ? rs : undefined,
            })
            // 补齐被 colSpan 覆盖的列
            for (let i = 1; i < cs; i++) {
              excelRow.push({ value: '', mergeHidden: true })
            }
          } else {
            excelRow.push({ value: '' })
          }
        }
        // 补齐到 columns 列
        const cols = group.columns || 4
        while (excelRow.length < cols) {
          excelRow.push({ value: '' })
        }
        grid.push(excelRow)
        rowHeights.push(32)
      }
    }
    // 旧版 items 格式（包含 field 和 subgroup）
    else if (group.items && group.items.length > 0) {
      const items = group.items
      const cols = group.columns || 2
      const currentRow: CellData[] = []
      let currentCol = 0

      for (const item of items) {
        if (item.type === 'field') {
          const fieldSpan = item.width || 1
          const cell: CellData = {
            value: `${item.fieldName}：{{${item.fieldName}}}`,
            fontSize: 13,
            colSpan: fieldSpan > 1 ? fieldSpan : undefined,
          }
          currentRow.push(cell)
          for (let i = 1; i < fieldSpan; i++) {
            currentRow.push({ value: '', mergeHidden: true })
          }
          currentCol += fieldSpan
        } else if (item.type === 'subgroup') {
          const subgroupSpan = item.width || 1
          const cell: CellData = {
            value: item.title || '',
            bold: true,
            fontSize: 13,
            colSpan: subgroupSpan > 1 ? subgroupSpan : undefined,
            bgColor: '#F5F5F5',
          }
          currentRow.push(cell)
          for (let i = 1; i < subgroupSpan; i++) {
            currentRow.push({ value: '', mergeHidden: true })
          }
          currentCol += subgroupSpan
        }

        if (currentCol >= cols) {
          while (currentRow.length < cols) {
            currentRow.push({ value: '' })
          }
          grid.push([...currentRow])
          rowHeights.push(32)
          currentRow.length = 0
          currentCol = 0
        }
      }

      if (currentRow.length > 0) {
        while (currentRow.length < cols) {
          currentRow.push({ value: '' })
        }
        grid.push([...currentRow])
        rowHeights.push(32)
      }
    }
    // 最旧版 fields 格式
    else if (group.fields && group.fields.length > 0) {
      const fields = group.fields
      const cols = group.columns || 2
      const currentRow: CellData[] = []
      let currentCol = 0

      for (const fieldConfig of fields) {
        const fieldSpan = fieldConfig.span || 1
        const cell: CellData = {
          value: `${fieldConfig.fieldName}：{{${fieldConfig.fieldName}}}`,
          fontSize: 13,
          colSpan: fieldSpan > 1 ? fieldSpan : undefined,
        }
        currentRow.push(cell)
        for (let i = 1; i < fieldSpan; i++) {
          currentRow.push({ value: '', mergeHidden: true })
        }
        currentCol += fieldSpan

        if (currentCol >= cols) {
          while (currentRow.length < cols) {
            currentRow.push({ value: '' })
          }
          grid.push([...currentRow])
          rowHeights.push(32)
          currentRow.length = 0
          currentCol = 0
        }
      }

      if (currentRow.length > 0) {
        while (currentRow.length < cols) {
          currentRow.push({ value: '' })
        }
        grid.push([...currentRow])
        rowHeights.push(32)
      }
    }
  }

  // 确保至少有 8 行
  while (grid.length < 8) {
    const emptyRow: CellData[] = Array.from(
      { length: colWidths.length },
      () => ({ value: '' })
    )
    grid.push(emptyRow)
    rowHeights.push(32)
  }

  return {
    grid,
    rowHeights,
    colWidths,
    pageSetup: defaultPageSetup(),
    subTables,
    defaultFontSize: 13,
    defaultRowHeight: 32,
  }
}