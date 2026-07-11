"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

// ZCELL 全局类型声明
declare global {
  interface Window {
    ZCell: any;
    jQuery: any;
    $: any;
  }
}

export interface ZCellSheetEditorProps {
  initialData?: ZCellWorkbookData;
  fields?: Array<{ id: number; name: string; label: string; type: string }>;
  onDataChange?: (data: ZCellWorkbookData) => void;
  onFieldInsert?: (fieldName: string) => void;
  height?: string;
  readonly?: boolean;
}

export interface ZCellSheetEditorHandle {
  insertField: (fieldName: string) => void;
  getData: () => ZCellWorkbookData | null;
  importFromExcel: (file: File) => Promise<boolean>;
  getSelectedCell: () => { row: number; col: number } | null;
  mergeSelected: () => void;
  unmergeSelected: () => void;
}

export interface ZCellCellData {
  value: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  bgColor?: string;
  textColor?: string;
  fontSize?: number;
  rowSpan?: number;
  colSpan?: number;
  mergeHidden?: boolean;
  formula?: string;
}

export interface ZCellWorkbookData {
  sheets: ZCellSheetData[];
  activeSheetIndex?: number;
}

export interface ZCellSheetData {
  name: string;
  rowCount: number;
  colCount: number;
  cells: Record<string, ZCellCellData>;
  merges: ZCellMergeData[];
  rowHeights: Record<number, number>;
  colWidths: Record<number, number>;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  freezeRow?: number;
  freezeCol?: number;
}

export interface ZCellMergeData {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

// 默认空工作簿
function createEmptyWorkbook(): ZCellWorkbookData {
  return {
    sheets: [
      {
        name: "Sheet1",
        rowCount: 50,
        colCount: 20,
        cells: {},
        merges: [],
        rowHeights: {},
        colWidths: {},
        defaultRowHeight: 24,
        defaultColWidth: 100,
      },
    ],
    activeSheetIndex: 0,
  };
}

// 从 ZCELL 实例读取数据
function readZCellData(zcell: any): ZCellWorkbookData | null {
  if (!zcell) return null;
  try {
    const sheetCount = zcell.GetSheetCount();
    const sheets: ZCellSheetData[] = [];
    let activeIdx = 0;

    for (let si = 0; si < sheetCount; si++) {
      zcell.SetActiveSheet(si);
      const sheetName = zcell.GetSheetName(si) || `Sheet${si + 1}`;
      const rowCount = zcell.GetRowCount() || 50;
      const colCount = zcell.GetColCount() || 20;

      const cells: Record<string, ZCellCellData> = {};
      const merges: ZCellMergeData[] = [];
      const rowHeights: Record<number, number> = {};
      const colWidths: Record<number, number> = {};

      // 读取单元格数据
      for (let r = 0; r < rowCount; r++) {
        const rh = zcell.GetRowHeight(r);
        if (rh && rh !== 24) rowHeights[r] = rh;

        for (let c = 0; c < colCount; c++) {
          const value = zcell.GetCellValue(r, c);
          if (value === undefined || value === null || value === "") continue;

          const style = zcell.GetCellStyle(r, c) || {};
          const border = zcell.GetCellBorder(r, c) || {};
          const cellType = zcell.GetCellType(r, c);

          const cellData: ZCellCellData = {
            value: String(value),
          };

          if (style.bold) cellData.bold = true;
          if (style.italic) cellData.italic = true;
          if (style.hAlign) cellData.align = style.hAlign;
          if (style.vAlign) cellData.verticalAlign = style.vAlign;
          if (style.bgColor) cellData.bgColor = style.bgColor;
          if (style.fontColor) cellData.textColor = style.fontColor;
          if (style.fontSize) cellData.fontSize = style.fontSize;

          cells[`${r},${c}`] = cellData;
        }
      }

      // 读取列宽
      for (let c = 0; c < colCount; c++) {
        const cw = zcell.GetColWidth(c);
        if (cw && cw !== 100) colWidths[c] = cw;
      }

      sheets.push({
        name: sheetName,
        rowCount,
        colCount,
        cells,
        merges,
        rowHeights,
        colWidths,
      });
    }

    return { sheets, activeSheetIndex: activeIdx };
  } catch (e) {
    console.error("Failed to read ZCell data:", e);
    return null;
  }
}

// 将工作簿数据写入 ZCELL 实例
function writeZCellData(zcell: any, data: ZCellWorkbookData) {
  if (!zcell || !data?.sheets?.length) return;

  // 清除现有sheet
  const existingCount = zcell.GetSheetCount();
  for (let i = existingCount - 1; i >= 0; i--) {
    if (existingCount > 1) {
      try { zcell.RemoveSheet(i); } catch (e) { /* ignore */ }
    }
  }

  data.sheets.forEach((sheetData, si) => {
    if (si === 0 && existingCount > 0) {
      // 重用第一个sheet
      try { zcell.SetSheetName(0, sheetData.name); } catch (e) { /* ignore */ }
    } else {
      zcell.AppendSheet({
        name: sheetData.name,
        rowCount: sheetData.rowCount || 50,
        colCount: sheetData.colCount || 20,
      });
    }

    zcell.SetActiveSheet(si);

    // 设置默认行列大小
    if (sheetData.defaultRowHeight) {
      try { zcell.SetDefaultRowHeight(sheetData.defaultRowHeight); } catch (e) { /* ignore */ }
    }
    if (sheetData.defaultColWidth) {
      try { zcell.SetDefaultColWidth(sheetData.defaultColWidth); } catch (e) { /* ignore */ }
    }

    // 写入单元格数据
    const cellEntries = Object.entries(sheetData.cells);
    for (const [key, cellData] of cellEntries) {
      const [r, c] = key.split(",").map(Number);
      if (cellData.value !== undefined && cellData.value !== null) {
        try { zcell.SetCellValue(r, c, cellData.value); } catch (e) { /* ignore */ }
      }

      // 设置样式
      const style: any = {};
      if (cellData.bold) style.bold = true;
      if (cellData.italic) style.italic = true;
      if (cellData.align) style.hAlign = cellData.align;
      if (cellData.verticalAlign) style.vAlign = cellData.verticalAlign;
      if (cellData.bgColor) style.bgColor = cellData.bgColor;
      if (cellData.textColor) style.fontColor = cellData.textColor;
      if (cellData.fontSize) style.fontSize = cellData.fontSize;
      if (Object.keys(style).length > 0) {
        try { zcell.SetCellStyle(r, c, style); } catch (e) { /* ignore */ }
      }
    }

    // 设置行高
    for (const [r, h] of Object.entries(sheetData.rowHeights)) {
      try { zcell.SetRowHeight(Number(r), h); } catch (e) { /* ignore */ }
    }

    // 设置列宽
    for (const [c, w] of Object.entries(sheetData.colWidths)) {
      try { zcell.SetColWidth(Number(c), w); } catch (e) { /* ignore */ }
    }
  });

  if (data.activeSheetIndex !== undefined) {
    try { zcell.SetActiveSheet(data.activeSheetIndex); } catch (e) { /* ignore */ }
  }

  try { zcell.Refresh(); } catch (e) { /* ignore */ }
}

export const ZCellSheetEditor = forwardRef<
  ZCellSheetEditorHandle,
  ZCellSheetEditorProps
>(({ initialData, fields, onDataChange, height = "600px", readonly = false }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zcellRef = useRef<any>(null);
  const initRef = useRef(false);

  // 初始化 ZCELL
  useEffect(() => {
    if (!containerRef.current || initRef.current) return;

    const initZCell = () => {
      const win = window as any;
      if (!win.ZCell || !win.ZCell.WorkBook) {
        setTimeout(initZCell, 100);
        return;
      }

      try {
        const container = containerRef.current!;
        const options = {
          container: container,
        };

        const zcell = new win.ZCell.WorkBook(options);
        zcellRef.current = zcell;

        // 写入初始数据
        const data = initialData || createEmptyWorkbook();
        writeZCellData(zcell, data);

        initRef.current = true;
      } catch (e) {
        console.error("Failed to initialize ZCell:", e);
      }
    };

    initZCell();

    return () => {
      if (zcellRef.current) {
        try {
          if (containerRef.current) {
            containerRef.current.innerHTML = "";
          }
        } catch (e) { /* ignore */ }
        zcellRef.current = null;
        initRef.current = false;
      }
    };
  }, [initialData]);

  // 获取当前选中单元格
  const getCurrentSelection = (): { row: number; col: number } | null => {
    const zcell = zcellRef.current;
    if (!zcell) return null;
    try {
      const sel = zcell.GetSelection();
      if (sel) {
        return { row: sel.row || sel.startRow || 0, col: sel.col || sel.startCol || 0 };
      }
      const activeCell = zcell.GetActiveCell();
      if (activeCell) {
        return { row: activeCell.row, col: activeCell.col };
      }
    } catch (e) { /* ignore */ }
    return null;
  };

  useImperativeHandle(ref, () => ({
    insertField(fieldName: string) {
      const zcell = zcellRef.current;
      if (!zcell) return;

      let selection = getCurrentSelection();
      if (!selection) {
        selection = { row: 0, col: 0 };
      }

      const cellValue = `{{${fieldName}}}`;
      try {
        zcell.SetCellValue(selection.row, selection.col, cellValue);
        zcell.Refresh();
      } catch (e) {
        console.error("insertField error:", e);
      }

      const data = readZCellData(zcell);
      if (data) onDataChange?.(data);
    },

    getData(): ZCellWorkbookData | null {
      return readZCellData(zcellRef.current);
    },

    async importFromExcel(file: File): Promise<boolean> {
      const zcell = zcellRef.current;
      if (!zcell) return false;

      try {
        // ZCELL 自带 ImportExcel 方法
        if (typeof zcell.ImportExcel === "function") {
          zcell.ImportExcel(file);
          zcell.Refresh();
          const data = readZCellData(zcell);
          if (data) onDataChange?.(data);
          return true;
        }

        // 回退：使用 xlsx 库解析
        const arrayBuffer = await file.arrayBuffer();
        const { read, utils } = await import("xlsx");
        const wb = read(arrayBuffer, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const worksheet = wb.Sheets[sheetName];
        const jsonData = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        for (let r = 0; r < jsonData.length; r++) {
          const row = jsonData[r];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            if (row[c] !== undefined && row[c] !== null) {
              zcell.SetCellValue(r, c, String(row[c]));
            }
          }
        }
        zcell.Refresh();

        const data = readZCellData(zcell);
        if (data) onDataChange?.(data);
        return true;
      } catch (e) {
        console.error("Failed to import Excel file:", e);
        return false;
      }
    },

    getSelectedCell() {
      return getCurrentSelection();
    },

    mergeSelected() {
      const zcell = zcellRef.current;
      if (!zcell) return;

      const selection = getCurrentSelection();
      if (!selection) return;

      try {
        // 尝试使用 ZCELL 的 MergeCell（需要选中区域）
        const sel = zcell.GetSelection();
        if (sel && sel.startRow !== undefined && sel.endRow !== undefined) {
          zcell.MergeCell(sel.startRow, sel.startCol, sel.endRow, sel.endCol);
        } else {
          // 单单元格合并到自身
          zcell.MergeCell(selection.row, selection.col, selection.row, selection.col);
        }
        zcell.Refresh();
      } catch (e) {
        console.error("mergeSelected error:", e);
      }

      const data = readZCellData(zcell);
      if (data) onDataChange?.(data);
    },

    unmergeSelected() {
      const zcell = zcellRef.current;
      if (!zcell) return;

      const selection = getCurrentSelection();
      if (!selection) return;

      try {
        if (typeof zcell.UnmergeCell === "function") {
          zcell.UnmergeCell(selection.row, selection.col);
          zcell.Refresh();
        }
      } catch (e) {
        console.error("unmergeSelected error:", e);
      }

      const data = readZCellData(zcell);
      if (data) onDataChange?.(data);
    },
  }));

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height }}
    />
  );
});

ZCellSheetEditor.displayName = "ZCellSheetEditor";

export default ZCellSheetEditor;