"use client"

import { useState, useRef, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react'
import { HotTable } from '@handsontable/react-wrapper'
import type { HotTableRef } from '@handsontable/react-wrapper'
import 'handsontable/styles/handsontable.min.css'
import { TableField } from '@prisma/client'
import * as ExcelJS from 'exceljs'

export interface CellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  align?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  bgColor?: string
  textColor?: string
  fontSize?: number
  wrapText?: boolean
}

export interface EditorConfig {
  rows: number
  cols: number
  data: any[][]
  styles: CellStyle[][]
  colWidths: number[]
  rowHeights: number[]
  mergedCells: { row: number; col: number; rowspan: number; colspan: number }[]
  formulas: string[][]
}

export interface ExcelEditorHandle {
  setCellStyle: (row: number, col: number, style: Partial<CellStyle>) => void
  insertField: (fieldName: string, fieldLabel: string) => void
  getSelectedCell: () => { row: number; col: number } | null
  mergeSelected: () => void
  unmergeSelected: () => void
  importFromExcel: (file: File) => Promise<boolean>
  exportToExcel: () => Promise<Blob | null>
  addRow: () => void
  addCol: () => void
  deleteRow: () => void
  deleteCol: () => void
  getData: () => EditorConfig
}

export interface ExcelEditorProps {
  initialData?: EditorConfig
  fields?: TableField[]
  onDataChange?: (config: EditorConfig) => void
}

const DEFAULT_ROWS = 30
const DEFAULT_COLS = 15
const DEFAULT_COL_WIDTH = 100
const DEFAULT_ROW_HEIGHT = 24

function createDefaultData(): EditorConfig {
  const data: any[][] = []
  const styles: CellStyle[][] = []
  const colWidths: number[] = []
  const rowHeights: number[] = []

  for (let i = 0; i < DEFAULT_ROWS; i++) {
    data.push(new Array(DEFAULT_COLS).fill(''))
    styles.push(new Array(DEFAULT_COLS).fill({}))
    rowHeights.push(DEFAULT_ROW_HEIGHT)
  }
  for (let i = 0; i < DEFAULT_COLS; i++) {
    colWidths.push(DEFAULT_COL_WIDTH)
  }

  return {
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    data,
    styles,
    colWidths,
    rowHeights,
    mergedCells: [],
    formulas: [],
  }
}

export const ExcelEditor = forwardRef<ExcelEditorHandle, ExcelEditorProps>(
  ({ initialData, fields, onDataChange }, ref) => {
    const hotTableRef = useRef<HotTableRef>(null)
    const [config, setConfig] = useState<EditorConfig>(() => {
      if (initialData && initialData.data && initialData.data.length > 0) {
        return initialData
      }
      return createDefaultData()
    })
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
      setIsMounted(true)
    }, [])

    const notifyChange = useCallback((newConfig: EditorConfig) => {
      if (onDataChange) {
        onDataChange(newConfig)
      }
    }, [onDataChange])

    const getHotInstance = useCallback(() => {
      return hotTableRef.current?.hotInstance || null
    }, [])

    const setCellStyle = useCallback((row: number, col: number, style: Partial<CellStyle>) => {
      const hot = getHotInstance()
      if (!hot) return

      const cellMeta = hot.getCellMeta(row, col) as any
      const ensureStyle = () => {
        if (!cellMeta.style) cellMeta.style = {}
        return cellMeta.style as Record<string, any>
      }

      if (style.bold !== undefined) {
        const s = ensureStyle()
        s.fontWeight = style.bold ? 'bold' : 'normal'
      }
      if (style.italic !== undefined) {
        const s = ensureStyle()
        s.fontStyle = style.italic ? 'italic' : 'normal'
      }
      if (style.underline !== undefined) {
        const s = ensureStyle()
        s.textDecoration = style.underline ? 'underline' : 'none'
      }
      if (style.align) {
        const s = ensureStyle()
        s.textAlign = style.align
      }
      if (style.verticalAlign) {
        const s = ensureStyle()
        s.verticalAlign = style.verticalAlign
      }
      if (style.bgColor) {
        const s = ensureStyle()
        s.backgroundColor = style.bgColor
      }
      if (style.textColor) {
        const s = ensureStyle()
        s.color = style.textColor
      }
      if (style.fontSize) {
        const s = ensureStyle()
        s.fontSize = style.fontSize + 'px'
      }
      if (style.wrapText !== undefined) {
        cellMeta.wrap = style.wrapText
      }

      hot.render()

      setConfig(prev => {
        const newStyles = JSON.parse(JSON.stringify(prev.styles))
        if (!newStyles[row]) newStyles[row] = []
        newStyles[row][col] = { ...newStyles[row][col], ...style }
        const newConfig = { ...prev, styles: newStyles }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    const insertField = useCallback((fieldName: string, fieldLabel: string) => {
      const hot = getHotInstance()
      if (!hot) return
      const selection = hot.getSelected() as unknown as number[]
      if (!selection || selection.length < 4) return

      const row = selection[0]
      const col = selection[1]
      const newValue = `{{${fieldName}}}`
      hot.setDataAtCell(row, col, newValue)
    }, [getHotInstance])

    const getSelectedCell = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return null
      const selection = hot.getSelected() as unknown as number[]
      if (!selection || selection.length < 4) return null
      return { row: selection[0], col: selection[1] }
    }, [getHotInstance])

    const mergeSelected = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      const selection = hot.getSelected() as unknown as number[]
      if (!selection || selection.length < 4) return

      const startRow = selection[0]
      const startCol = selection[1]
      const endRow = selection[2]
      const endCol = selection[3]
      const mergePlugin = hot.getPlugin('mergeCells') as any
      if (mergePlugin) {
        mergePlugin.merge(startRow, startCol, endRow, endCol)
      }
    }, [getHotInstance])

    const unmergeSelected = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      const selection = hot.getSelected() as unknown as number[]
      if (!selection || selection.length < 4) return

      const startRow = selection[0]
      const startCol = selection[1]
      const endRow = selection[2]
      const endCol = selection[3]
      const mergePlugin = hot.getPlugin('mergeCells') as any
      if (mergePlugin) {
        mergePlugin.unmerge(startRow, startCol, endRow, endCol)
      }
    }, [getHotInstance])

    const importFromExcel = useCallback(async (file: File): Promise<boolean> => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(arrayBuffer as ArrayBuffer)

        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          throw new Error('Excel文件中没有工作表')
        }

        const rowCount = Math.max(worksheet.rowCount || DEFAULT_ROWS, DEFAULT_ROWS)
        const colCount = Math.max(worksheet.columnCount || DEFAULT_COLS, DEFAULT_COLS)
        const newData: any[][] = []
        const newStyles: CellStyle[][] = []
        const newColWidths: number[] = []
        const newRowHeights: number[] = []

        for (let r = 1; r <= rowCount; r++) {
          const row: any[] = []
          const cellStyles: CellStyle[] = []
          const rowData = worksheet.getRow(r)
          newRowHeights.push(rowData.height || DEFAULT_ROW_HEIGHT)

          for (let c = 1; c <= colCount; c++) {
            const cellData = rowData.getCell(c)
            row.push(cellData.value?.toString() || '')
            cellStyles.push({
              bold: cellData.font?.bold,
              italic: cellData.font?.italic,
              underline: cellData.font?.underline ? true : false,
              fontSize: cellData.font?.size,
              bgColor: (cellData.fill as any)?.fgColor?.argb ? '#' + (cellData.fill as any).fgColor.argb.slice(2) : undefined,
              textColor: cellData.font?.color?.argb ? '#' + cellData.font.color.argb.slice(2) : undefined,
              align: cellData.alignment?.horizontal as any,
              verticalAlign: cellData.alignment?.vertical as any,
              wrapText: cellData.alignment?.wrapText,
            })
          }
          newData.push(row)
          newStyles.push(cellStyles)
        }

        for (let c = 1; c <= colCount; c++) {
          newColWidths.push((worksheet.getColumn(c).width || DEFAULT_COL_WIDTH) * 10)
        }

        const newConfig: EditorConfig = {
          rows: rowCount,
          cols: colCount,
          data: newData,
          styles: newStyles,
          colWidths: newColWidths,
          rowHeights: newRowHeights,
          mergedCells: [],
          formulas: config.formulas,
        }

        setConfig(newConfig)
        notifyChange(newConfig)
        return true
      } catch (error) {
        console.error('Import Excel error:', error)
        return false
      }
    }, [config.formulas, notifyChange])

    const exportToExcel = useCallback(async (): Promise<Blob | null> => {
      try {
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('模板')

        config.data.forEach((rowData, rowIndex) => {
          const row = worksheet.addRow(rowData)
          if (config.rowHeights[rowIndex]) {
            row.height = config.rowHeights[rowIndex]
          }

          rowData.forEach((cellData, colIndex) => {
            const cell = row.getCell(colIndex + 1)
            const cellStyle = config.styles[rowIndex]?.[colIndex]

            if (cellStyle) {
              if (cellStyle.bold || cellStyle.italic || cellStyle.underline || cellStyle.fontSize || cellStyle.textColor) {
                cell.font = {
                  bold: cellStyle.bold,
                  italic: cellStyle.italic,
                  underline: cellStyle.underline ? true : false,
                  size: cellStyle.fontSize,
                  color: cellStyle.textColor ? { argb: cellStyle.textColor.replace('#', 'FF') } : undefined,
                }
              }
              if (cellStyle.bgColor) {
                cell.fill = {
                  type: 'pattern',
                  pattern: 'solid',
                  fgColor: { argb: cellStyle.bgColor.replace('#', 'FF') },
                }
              }
              if (cellStyle.align || cellStyle.verticalAlign || cellStyle.wrapText) {
                cell.alignment = {
                  horizontal: cellStyle.align,
                  vertical: cellStyle.verticalAlign,
                  wrapText: cellStyle.wrapText,
                }
              }
            }

            if (config.formulas[rowIndex]?.[colIndex]) {
              cell.value = { formula: config.formulas[rowIndex][colIndex].replace('=', '') }
            }
          })
        })

        config.colWidths.forEach((width, index) => {
          worksheet.getColumn(index + 1).width = width / 10
        })

        config.mergedCells.forEach((merge: any) => {
          worksheet.mergeCells(
            merge.row + 1,
            merge.col + 1,
            merge.row + merge.rowspan,
            merge.col + merge.colspan
          )
        })

        const buffer = await workbook.xlsx.writeBuffer()
        return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      } catch (error) {
        console.error('Export Excel error:', error)
        return null
      }
    }, [config])

    const addRow = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      hot.alter('insert_row', hot.countRows())
      setConfig(prev => {
        const newRowHeights = [...prev.rowHeights, DEFAULT_ROW_HEIGHT]
        const newData = [...prev.data, new Array(prev.cols).fill('')]
        const newStyles = [...prev.styles, new Array(prev.cols).fill({})]
        const newConfig = { ...prev, rows: prev.rows + 1, data: newData, styles: newStyles, rowHeights: newRowHeights }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    const addCol = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      hot.alter('insert_col', hot.countCols())
      setConfig(prev => {
        const newColWidths = [...prev.colWidths, DEFAULT_COL_WIDTH]
        const newData = prev.data.map(row => [...row, ''])
        const newStyles = prev.styles.map(row => [...row, {}])
        const newConfig = { ...prev, cols: prev.cols + 1, data: newData, styles: newStyles, colWidths: newColWidths }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    const deleteRow = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      const selection = hot.getSelected() as unknown as number[]
      if (!selection) return
      hot.alter('remove_row', selection[0])
      setConfig(prev => {
        const newRowHeights = [...prev.rowHeights]
        newRowHeights.splice(selection[0], 1)
        const newData = [...prev.data]
        newData.splice(selection[0], 1)
        const newStyles = [...prev.styles]
        newStyles.splice(selection[0], 1)
        const newConfig = { ...prev, rows: prev.rows - 1, data: newData, styles: newStyles, rowHeights: newRowHeights }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    const deleteCol = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      const selection = hot.getSelected() as unknown as number[]
      if (!selection) return
      hot.alter('remove_col', selection[1])
      setConfig(prev => {
        const newColWidths = [...prev.colWidths]
        newColWidths.splice(selection[1], 1)
        const newData = prev.data.map(row => {
          const newRow = [...row]
          newRow.splice(selection[1], 1)
          return newRow
        })
        const newStyles = prev.styles.map(row => {
          const newRow = [...row]
          newRow.splice(selection[1], 1)
          return newRow
        })
        const newConfig = { ...prev, cols: prev.cols - 1, data: newData, styles: newStyles, colWidths: newColWidths }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    const getData = useCallback((): EditorConfig => {
      return config
    }, [config])

    const handleAfterChange = useCallback((changes: any, source: string) => {
      if (!changes || source === 'loadData') return
      setConfig(prev => {
        const newData = JSON.parse(JSON.stringify(prev.data))
        const newFormulas = JSON.parse(JSON.stringify(prev.formulas || []))
        changes.forEach(([row, col, oldVal, newVal]: [number, number, any, any]) => {
          if (row >= 0 && col >= 0 && row < newData.length && col < newData[0].length) {
            newData[row][col] = newVal
            if (typeof newVal === 'string' && newVal.startsWith('=')) {
              if (!newFormulas[row]) newFormulas[row] = []
              newFormulas[row][col] = newVal
            } else if (newFormulas[row] && newFormulas[row][col]) {
              delete newFormulas[row][col]
            }
          }
        })
        const newConfig = { ...prev, data: newData, formulas: newFormulas }
        notifyChange(newConfig)
        return newConfig
      })
    }, [notifyChange])

    const handleAfterColumnResize = useCallback((column: number, width: number) => {
      setConfig(prev => {
        const newColWidths = [...prev.colWidths]
        newColWidths[column] = width
        const newConfig = { ...prev, colWidths: newColWidths }
        notifyChange(newConfig)
        return newConfig
      })
    }, [notifyChange])

    const handleAfterRowResize = useCallback((row: number, height: number) => {
      setConfig(prev => {
        const newRowHeights = [...prev.rowHeights]
        newRowHeights[row] = height
        const newConfig = { ...prev, rowHeights: newRowHeights }
        notifyChange(newConfig)
        return newConfig
      })
    }, [notifyChange])

    const handleAfterMergeCells = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      const mergePlugin = hot.getPlugin('mergeCells') as any
      if (!mergePlugin) return
      const merged = mergePlugin.mergedCellsCollection.mergedCells
      setConfig(prev => {
        const newConfig = { ...prev, mergedCells: merged }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    const handleAfterUnmergeCells = useCallback(() => {
      const hot = getHotInstance()
      if (!hot) return
      const mergePlugin = hot.getPlugin('mergeCells') as any
      if (!mergePlugin) return
      const merged = mergePlugin.mergedCellsCollection.mergedCells
      setConfig(prev => {
        const newConfig = { ...prev, mergedCells: merged }
        notifyChange(newConfig)
        return newConfig
      })
    }, [getHotInstance, notifyChange])

    useImperativeHandle(ref, () => ({
      setCellStyle,
      insertField,
      getSelectedCell,
      mergeSelected,
      unmergeSelected,
      importFromExcel,
      exportToExcel,
      addRow,
      addCol,
      deleteRow,
      deleteCol,
      getData,
    }))

    if (!isMounted) {
      return <div className="w-full" style={{ height: '500px' }} />
    }

    return (
      <div style={{ width: '100%', height: '500px', overflow: 'hidden' }}>
        <HotTable
          ref={hotTableRef}
          data={config.data}
          colWidths={config.colWidths}
          rowHeights={config.rowHeights}
          mergedCells={config.mergedCells}
          rowHeaders={true}
          colHeaders={true}
          contextMenu={true}
          mergeCells={true}
          autoRowSize={false}
          autoColSize={false}
          allowInsertRow={true}
          allowInsertCol={true}
          allowDeleteRow={true}
          allowDeleteCol={true}
          allowUndo={true}
          allowRedo={true}
          manualRowResize={true}
          manualColumnResize={true}
          manualRowMove={true}
          manualColumnMove={true}
          formulas={false}
          licenseKey="non-commercial-and-evaluation"
          width="100%"
          height="100%"
          afterChange={handleAfterChange}
          afterColumnResize={handleAfterColumnResize}
          afterRowResize={handleAfterRowResize}
          afterMergeCells={handleAfterMergeCells}
          afterUnmergeCells={handleAfterUnmergeCells}
        />
      </div>
    )
  }
)

ExcelEditor.displayName = 'ExcelEditor'

export default ExcelEditor
