"use client"

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import Handsontable from 'handsontable'
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

export const ExcelEditor = forwardRef<ExcelEditorHandle, ExcelEditorProps>(
  ({ initialData, fields, onDataChange }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const hotRef = useRef<Handsontable | null>(null)
    const [data, setData] = useState<any[][]>([])
    const [styles, setStyles] = useState<CellStyle[][]>([])
    const [colWidths, setColWidths] = useState<number[]>([])
    const [rowHeights, setRowHeights] = useState<number[]>([])
    const [mergedCells, setMergedCells] = useState<any[]>([])
    const [formulas, setFormulas] = useState<string[][]>([])

    useEffect(() => {
      if (initialData) {
        setData(initialData.data || [])
        setStyles(initialData.styles || [])
        setColWidths(initialData.colWidths || [])
        setRowHeights(initialData.rowHeights || [])
        setMergedCells(initialData.mergedCells || [])
        setFormulas(initialData.formulas || [])
      } else {
        const newData: any[][] = []
        const newStyles: CellStyle[][] = []
        const newColWidths: number[] = []
        const newRowHeights: number[] = []

        for (let i = 0; i < DEFAULT_ROWS; i++) {
          newData.push(new Array(DEFAULT_COLS).fill(''))
          newStyles.push(new Array(DEFAULT_COLS).fill({}))
          newRowHeights.push(DEFAULT_ROW_HEIGHT)
        }
        for (let i = 0; i < DEFAULT_COLS; i++) {
          newColWidths.push(DEFAULT_COL_WIDTH)
        }

        setData(newData)
        setStyles(newStyles)
        setColWidths(newColWidths)
        setRowHeights(newRowHeights)
      }
    }, [initialData])

    useEffect(() => {
      if (!containerRef.current) return

      const hot = new Handsontable(containerRef.current, {
        data: data,
        colWidths: colWidths,
        rowHeights: rowHeights,
        mergedCells: mergedCells,
        rowHeaders: true,
        colHeaders: true,
        contextMenu: true,
        mergeCells: true,
        autoRowSize: false,
        autoColSize: false,
        allowInsertRow: true,
        allowInsertCol: true,
        allowDeleteRow: true,
        allowDeleteCol: true,
        allowUndo: true,
        allowRedo: true,
        manualRowResize: true,
        manualColumnResize: true,
        manualRowMove: true,
        manualColumnMove: true,
        formulas: true,
        licenseKey: 'non-commercial-and-evaluation',
        afterChange: (changes: any) => {
          if (!changes) return
          const newData = JSON.parse(JSON.stringify(data))
          const newFormulas = JSON.parse(JSON.stringify(formulas))
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
          setData(newData)
          setFormulas(newFormulas)
          notifyChange(newData, styles, colWidths, rowHeights, mergedCells, newFormulas)
        },
        afterColumnResize: (column: number, width: number) => {
          const newColWidths = [...colWidths]
          newColWidths[column] = width
          setColWidths(newColWidths)
          notifyChange(data, styles, newColWidths, rowHeights, mergedCells, formulas)
        },
        afterRowResize: (row: number, height: number) => {
          const newRowHeights = [...rowHeights]
          newRowHeights[row] = height
          setRowHeights(newRowHeights)
          notifyChange(data, styles, colWidths, newRowHeights, mergedCells, formulas)
        },
        afterMergeCells: (cellRange: any, mergeParent: any, auto: boolean) => {
          const merged = hot.getPlugin('mergeCells').mergedCellsCollection.mergedCells
          setMergedCells(merged)
          notifyChange(data, styles, colWidths, rowHeights, merged, formulas)
        },
        afterUnmergeCells: (cellRange: any, auto: boolean) => {
          const merged = hot.getPlugin('mergeCells').mergedCellsCollection.mergedCells
          setMergedCells(merged)
          notifyChange(data, styles, colWidths, rowHeights, merged, formulas)
        },
        afterRemoveCellMeta: () => {
          notifyChange(data, styles, colWidths, rowHeights, mergedCells, formulas)
        },
      })

      hotRef.current = hot

      return () => {
        hot.destroy()
      }
    }, [])

    const notifyChange = useCallback((
      newData: any[][],
      newStyles: CellStyle[][],
      newColWidths: number[],
      newRowHeights: number[],
      newMergedCells: any[],
      newFormulas: string[][]
    ) => {
      if (onDataChange) {
        onDataChange({
          rows: newData.length,
          cols: newData[0]?.length || DEFAULT_COLS,
          data: newData,
          styles: newStyles,
          colWidths: newColWidths,
          rowHeights: newRowHeights,
          mergedCells: newMergedCells,
          formulas: newFormulas,
        })
      }
    }, [onDataChange])

    const setCellStyle = useCallback((row: number, col: number, style: Partial<CellStyle>) => {
      if (!hotRef.current) return
      const hot = hotRef.current
      const cellMeta = hot.getCellMeta(row, col)
      
      if (style.bold !== undefined) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.fontWeight = style.bold ? 'bold' : 'normal'
      }
      if (style.italic !== undefined) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.fontStyle = style.italic ? 'italic' : 'normal'
      }
      if (style.underline !== undefined) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.textDecoration = style.underline ? 'underline' : 'none'
      }
      if (style.align) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.textAlign = style.align
      }
      if (style.verticalAlign) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.verticalAlign = style.verticalAlign
      }
      if (style.bgColor) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.backgroundColor = style.bgColor
      }
      if (style.textColor) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.color = style.textColor
      }
      if (style.fontSize) {
        if (!cellMeta.style) cellMeta.style = {}
        cellMeta.style.fontSize = style.fontSize + 'px'
      }
      if (style.wrapText !== undefined) {
        cellMeta.wrap = style.wrapText
      }

      hot.render()

      const newStyles = JSON.parse(JSON.stringify(styles))
      if (!newStyles[row]) newStyles[row] = []
      newStyles[row][col] = { ...newStyles[row][col], ...style }
      setStyles(newStyles)
      notifyChange(data, newStyles, colWidths, rowHeights, mergedCells, formulas)
    }, [styles, data, colWidths, rowHeights, mergedCells, formulas, notifyChange])

    const insertField = useCallback((fieldName: string, fieldLabel: string) => {
      if (!hotRef.current) return
      const selection = hotRef.current.getSelected()
      if (!selection || selection.length < 4) return
      
      const [row, col] = [selection[0], selection[1]]
      const newValue = `{{${fieldName}}}`
      hotRef.current.setDataAtCell(row, col, newValue)
    }, [])

    const getSelectedCell = useCallback(() => {
      if (!hotRef.current) return null
      const selection = hotRef.current.getSelected()
      if (!selection || selection.length < 4) return null
      return { row: selection[0], col: selection[1] }
    }, [])

    const mergeSelected = useCallback(() => {
      if (!hotRef.current) return
      const selection = hotRef.current.getSelected()
      if (!selection || selection.length < 4) return
      
      const [startRow, startCol, endRow, endCol] = selection
      const mergePlugin = hotRef.current.getPlugin('mergeCells')
      if (mergePlugin) {
        mergePlugin.merge(startRow, startCol, endRow, endCol)
      }
    }, [])

    const unmergeSelected = useCallback(() => {
      if (!hotRef.current) return
      const selection = hotRef.current.getSelected()
      if (!selection || selection.length < 4) return
      
      const [startRow, startCol, endRow, endCol] = selection
      const mergePlugin = hotRef.current.getPlugin('mergeCells')
      if (mergePlugin) {
        mergePlugin.unmerge(startRow, startCol, endRow, endCol)
      }
    }, [])

    const importFromExcel = useCallback(async (file: File) => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(arrayBuffer as ArrayBuffer)
        
        const worksheet = workbook.worksheets[0]
        if (!worksheet) {
          throw new Error('Excel文件中没有工作表')
        }

        const rowCount = worksheet.rowCount || DEFAULT_ROWS
        const colCount = worksheet.columnCount || DEFAULT_COLS
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

        setData(newData)
        setStyles(newStyles)
        setColWidths(newColWidths)
        setRowHeights(newRowHeights)
        setMergedCells([])

        if (hotRef.current) {
          hotRef.current.loadData(newData)
          hotRef.current.updateSettings({
            colWidths: newColWidths,
            rowHeights: newRowHeights,
            mergedCells: [],
          })
        }

        notifyChange(newData, newStyles, newColWidths, newRowHeights, [], formulas)
        return true
      } catch (error) {
        console.error('Import Excel error:', error)
        return false
      }
    }, [formulas, notifyChange])

    const exportToExcel = useCallback(async (): Promise<Blob | null> => {
      try {
        const workbook = new ExcelJS.Workbook()
        const worksheet = workbook.addWorksheet('模板')

        data.forEach((rowData, rowIndex) => {
          const row = worksheet.addRow(rowData)
          if (rowHeights[rowIndex]) {
            row.height = rowHeights[rowIndex]
          }
          
          rowData.forEach((cellData, colIndex) => {
            const cell = row.getCell(colIndex + 1)
            const cellStyle = styles[rowIndex]?.[colIndex]
            
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

            if (formulas[rowIndex]?.[colIndex]) {
              cell.value = { formula: formulas[rowIndex][colIndex].replace('=', '') }
            }
          })
        })

        colWidths.forEach((width, index) => {
          worksheet.getColumn(index + 1).width = width / 10
        })

        mergedCells.forEach((merge: any) => {
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
    }, [data, styles, colWidths, rowHeights, mergedCells, formulas])

    const addRow = useCallback(() => {
      if (!hotRef.current) return
      hotRef.current.alter('insert_row', hotRef.current.countRows())
      const newRowHeights = [...rowHeights]
      newRowHeights.push(DEFAULT_ROW_HEIGHT)
      setRowHeights(newRowHeights)
    }, [rowHeights])

    const addCol = useCallback(() => {
      if (!hotRef.current) return
      hotRef.current.alter('insert_col', hotRef.current.countCols())
      const newColWidths = [...colWidths]
      newColWidths.push(DEFAULT_COL_WIDTH)
      setColWidths(newColWidths)
    }, [colWidths])

    const deleteRow = useCallback(() => {
      if (!hotRef.current) return
      const selection = hotRef.current.getSelected()
      if (!selection) return
      hotRef.current.alter('remove_row', selection[0])
      const newRowHeights = [...rowHeights]
      newRowHeights.splice(selection[0], 1)
      setRowHeights(newRowHeights)
    }, [rowHeights])

    const deleteCol = useCallback(() => {
      if (!hotRef.current) return
      const selection = hotRef.current.getSelected()
      if (!selection) return
      hotRef.current.alter('remove_col', selection[1])
      const newColWidths = [...colWidths]
      newColWidths.splice(selection[1], 1)
      setColWidths(newColWidths)
    }, [colWidths])

    const getData = useCallback((): EditorConfig => {
      return {
        rows: data.length,
        cols: data[0]?.length || DEFAULT_COLS,
        data: data,
        styles: styles,
        colWidths: colWidths,
        rowHeights: rowHeights,
        mergedCells: mergedCells,
        formulas: formulas,
      }
    }, [data, styles, colWidths, rowHeights, mergedCells, formulas])

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

    return (
      <div ref={containerRef} className="w-full" style={{ height: '500px' }} />
    )
  }
)

ExcelEditor.displayName = 'ExcelEditor'

export default ExcelEditor
