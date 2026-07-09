"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

import {
  Univer,
  UniverInstanceType,
  LocaleType,
  ICommandService,
  IUniverInstanceService,
  Injector,
  Workbook,
} from "@univerjs/core";
import type { IWorkbookData, IRange } from "@univerjs/core";

import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverFormulaEnginePlugin } from "@univerjs/engine-formula";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import { UniverSheetsUIPlugin } from "@univerjs/sheets-ui";
import { UniverSheetsFormulaPlugin } from "@univerjs/sheets-formula";
import { UniverSheetsFormulaUIPlugin } from "@univerjs/sheets-formula-ui";

// Sheet commands for cell manipulation
import {
  SetRangeValuesCommand,
  AddWorksheetMergeAllCommand,
  AddWorksheetMergeCommand,
  RemoveWorksheetMergeMutation,
  AddWorksheetMergeMutation,
} from "@univerjs/sheets";

import DesignZhCN from "@univerjs/design/locale/zh-CN";
import UIZhCN from "@univerjs/ui/locale/zh-CN";
import DocsUIZhCN from "@univerjs/docs-ui/locale/zh-CN";
import SheetsZhCN from "@univerjs/sheets/locale/zh-CN";
import SheetsUIZhCN from "@univerjs/sheets-ui/locale/zh-CN";
import SheetsFormulaUIZhCN from "@univerjs/sheets-formula-ui/locale/zh-CN";

import "@univerjs/design/lib/index.css";
import "@univerjs/ui/lib/index.css";
import "@univerjs/docs-ui/lib/index.css";
import "@univerjs/sheets-ui/lib/index.css";
import "@univerjs/sheets-formula-ui/lib/index.css";

export interface UniverSheetEditorProps {
  initialData?: IWorkbookData;
  fields?: Array<{ id: number; name: string; label: string; type: string }>;
  onDataChange?: (data: IWorkbookData) => void;
  onFieldInsert?: (fieldName: string) => void;
  height?: string;
  readonly?: boolean;
}

export interface UniverSheetEditorHandle {
  insertField: (fieldName: string) => void;
  getData: () => IWorkbookData | null;
  importFromExcel: (file: File) => Promise<boolean>;
  getSelectedCell: () => { row: number; col: number } | null;
  mergeSelected: () => void;
  unmergeSelected: () => void;
}

export const UniverSheetEditor = forwardRef<
  UniverSheetEditorHandle,
  UniverSheetEditorProps
>(({ initialData, onDataChange, height = "600px", readonly = false }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const univerRef = useRef<Univer | null>(null);
  const injectorRef = useRef<Injector | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const univer = new Univer({
      locale: LocaleType.ZH_CN,
      locales: {
        [LocaleType.ZH_CN]: {
          ...DesignZhCN,
          ...UIZhCN,
          ...DocsUIZhCN,
          ...SheetsZhCN,
          ...SheetsUIZhCN,
          ...SheetsFormulaUIZhCN,
        },
      },
    });

    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverFormulaEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, {
      container: containerRef.current,
    });
    univer.registerPlugin(UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUIPlugin);
    univer.registerPlugin(UniverSheetsPlugin);
    univer.registerPlugin(UniverSheetsUIPlugin);
    univer.registerPlugin(UniverSheetsFormulaPlugin);
    univer.registerPlugin(UniverSheetsFormulaUIPlugin);

    univer.createUnit(UniverInstanceType.UNIVER_SHEET, initialData ?? {});

    const injector = univer.__getInjector();
    univerRef.current = univer;
    injectorRef.current = injector;

    return () => {
      univer.dispose();
      univerRef.current = null;
      injectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: get the active workbook snapshot data
  const getSnapshot = (): IWorkbookData | null => {
    const injector = injectorRef.current;
    if (!injector) return null;
    try {
      const instanceService = injector.get(IUniverInstanceService);
      const unit = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
      if (!unit) return null;
      const workbook = unit as Workbook;
      return workbook.save();
    } catch {
      return null;
    }
  };

  // Helper: get current selection
  const getCurrentSelection = (): { row: number; col: number } | null => {
    const injector = injectorRef.current;
    if (!injector) return null;
    try {
      const instanceService = injector.get(IUniverInstanceService);
      const unit = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
      if (!unit) return null;
      const workbook = unit as any;
      const sheet = workbook.getActiveSheet();
      if (!sheet) return null;
      const selection = sheet.getSelection();
      if (!selection) return null;
      const ranges = selection.getSelectionRanges();
      if (!ranges || ranges.length === 0) return null;
      const range = ranges[0];
      return { row: range.startRow, col: range.startColumn };
    } catch {
      return null;
    }
  };

  useImperativeHandle(ref, () => ({
    insertField(fieldName: string) {
      const injector = injectorRef.current;
      if (!injector) return;

      const selection = getCurrentSelection();
      if (!selection) return;

      const commandService = injector.get(ICommandService);
      const instanceService = injector.get(IUniverInstanceService);
      const unit = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
      if (!unit) return;

      const unitId = unit.getUnitId();
      const workbook = unit as any;
      const sheet = workbook.getActiveSheet();
      const subUnitId = sheet?.getSheetId();

      commandService.executeCommand(SetRangeValuesCommand.id, {
        unitId,
        subUnitId,
        range: {
          startRow: selection.row,
          endRow: selection.row,
          startColumn: selection.col,
          endColumn: selection.col,
        },
        cellValue: {
          [selection.row]: {
            [selection.col]: {
              v: `{{${fieldName}}}`,
            },
          },
        },
      } as any);

      const data = getSnapshot();
      if (data) onDataChange?.(data);
    },

    getData(): IWorkbookData | null {
      return getSnapshot();
    },

    async importFromExcel(file: File): Promise<boolean> {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const { read, utils } = await import("xlsx");
        const wb = read(arrayBuffer, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const worksheet = wb.Sheets[sheetName];
        const jsonData = utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        const injector = injectorRef.current;
        if (!injector) return false;

        const commandService = injector.get(ICommandService);
        const instanceService = injector.get(IUniverInstanceService);
        const unit = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
        if (!unit) return false;

        const unitId = unit.getUnitId();
        const workbook = unit as any;
        const sheet = workbook.getActiveSheet();
        const subUnitId = sheet?.getSheetId();

        // Convert 2D array to cell value object
        const cellValue: Record<number, Record<number, any>> = {};
        for (let r = 0; r < jsonData.length; r++) {
          const row = jsonData[r];
          if (!row) continue;
          cellValue[r] = {};
          for (let c = 0; c < row.length; c++) {
            if (row[c] !== undefined && row[c] !== null) {
              cellValue[r][c] = { v: row[c] };
            }
          }
        }

        commandService.executeCommand(SetRangeValuesCommand.id, {
          unitId,
          subUnitId,
          range: {
            startRow: 0,
            endRow: jsonData.length - 1,
            startColumn: 0,
            endColumn: Math.max(...jsonData.map((r: any[]) => r?.length ?? 0)) - 1,
          },
          cellValue,
        } as any);

        const data = getSnapshot();
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
      const injector = injectorRef.current;
      if (!injector) return;

      const selection = getCurrentSelection();
      if (!selection) return;

      const commandService = injector.get(ICommandService);
      const instanceService = injector.get(IUniverInstanceService);
      const unit = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
      if (!unit) return;

      const unitId = unit.getUnitId();
      const workbook = unit as any;
      const sheet = workbook.getActiveSheet();
      const subUnitId = sheet?.getSheetId();
      const selRanges = sheet?.getSelection()?.getSelectionRanges();
      if (!selRanges || selRanges.length === 0) return;

      const range = selRanges[0];
      commandService.executeCommand(AddWorksheetMergeAllCommand.id, {
        unitId,
        subUnitId,
        ranges: [range],
      } as any);

      const data = getSnapshot();
      if (data) onDataChange?.(data);
    },

    unmergeSelected() {
      const injector = injectorRef.current;
      if (!injector) return;

      const commandService = injector.get(ICommandService);
      const instanceService = injector.get(IUniverInstanceService);
      const unit = instanceService.getCurrentUnitOfType(UniverInstanceType.UNIVER_SHEET);
      if (!unit) return;

      const unitId = unit.getUnitId();
      const workbook = unit as any;
      const sheet = workbook.getActiveSheet();
      const subUnitId = sheet?.getSheetId();
      const selRanges = sheet?.getSelection()?.getSelectionRanges();
      if (!selRanges || selRanges.length === 0) return;

      const range = selRanges[0];
      commandService.executeCommand(RemoveWorksheetMergeMutation.id, {
        unitId,
        subUnitId,
        ranges: [range],
      } as any);

      const data = getSnapshot();
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

UniverSheetEditor.displayName = "UniverSheetEditor";

export default UniverSheetEditor;
