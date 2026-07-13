# 表单设计器 Excel 编辑模式改造方案

## 1. 概述

将表单设计器（`FormLayoutDesigner`）完全重新设计，采用与 Excel 模板设计器（`ExcelTemplateDesigner`）相同的编辑模式，支持单元格文本 + `{{字段名}}` 占位符、格式工具、合并单元格、公式、导入 Excel、页面布局等功能。同时去掉分组概念，改为单一表格，并在表格下方保留子表模块。

## 2. 数据模型

### 2.1 新配置格式

```typescript
interface FormExcelConfig {
  grid: CellData[][]          // 复用 ExcelTemplateDesigner 的 CellData
  rowHeights: number[]        // 每行高度
  colWidths: number[]         // 每列宽度
  pageSetup: PageSetup        // 页面布局设置
  subTables: SubTableConfig[] // 子表模块列表
}

interface SubTableConfig {
  tableId: number
  tableName: string
  label: string
  fields: string[]            // 子表显示字段名列表
}

interface CellData {
  value: string               // 文本 + {{fieldName}} 占位符
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
  rowSpan?: number
  colSpan?: number
  mergeHidden?: boolean
  formula?: string
}
```

### 2.2 旧格式兼容

`FormLayoutConfig` → `FormExcelConfig` 的迁移规则：
- 合并所有 `groups` 的 `rows` 到一个表格中
- 每个 `FormCellData` 的 `fieldId`/`fieldName` 映射为 `{{fieldName}}` 占位符放入 `value`
- 分组之间的 `title` 作为合并单元格的标题行插入
- `colWidths`/`fontSize`/`labelWidth` 映射到对应属性

## 3. 组件架构

### 3.1 FormExcelDesigner（新组件）

位置：`web/components/form-excel-designer.tsx`

整体布局：
- 顶部：标题 + 操作按钮（保存）
- 工具栏：完全复用 ExcelTemplateDesigner 的格式工具栏
- 主体：左侧字段面板（可插入字段）+ 右侧 Excel 表格编辑器
- 底部：子表模块配置区域

编辑器表格：
- 列头 A/B/C/D... + 行号 1/2/3...
- 拖拽选中多个单元格
- 键盘方向键导航
- 列宽/行高拖拽调整
- 单元格内编辑 `{{fieldName}}` 占位符

### 3.2 DynamicForm（渲染器改造）

位置：`web/components/dynamic-form.tsx`

- 解析 `grid` 中的 `CellData`
- 检测 `value` 中的 `{{fieldName}}` 占位符（正则匹配）
- 将占位符替换为实际表单输入控件（Input/Select/DatePicker 等）
- 保留单元格格式样式（字体大小、颜色、对齐等）
- 支持合并单元格渲染
- 在表格下方渲染子表模块

### 3.3 字段占位符解析逻辑

```
输入: "姓名：{{name}}  电话：{{phone}}"
                    ↓
解析: [{text: "姓名：", field: "name"}, {text: "  电话：", field: "phone"}]
                    ↓
渲染: <span>姓名：</span><Input value={values.name} /> <span>  电话：</span><Input value={values.phone} />
```

## 4. 子表模块

### 4.1 设计器中的子表配置

- 表格下方显示"子表模块"区域
- 点击"添加子表"按钮，弹出对话框选择关联子表和字段
- 每个子表配置包含：关联表 ID、显示名称、字段列表
- 支持删除子表配置
- 保存时将子表配置存入 `FormExcelConfig.subTables`

### 4.2 渲染器中的子表渲染

- 在表格下方按顺序渲染子表
- 每个子表显示为可添加/删除多条数据的明细表格
- 复用现有 `DETAIL_TABLE` 字段的渲染逻辑
- 支持最少/最多行数限制

## 5. 数据兼容与迁移

### 5.1 加载旧数据

当检测到 `FormLayoutConfig` 格式时，自动执行迁移：
1. 遍历所有 `FormLayoutGroup`
2. 将每个分组标题行写入合并单元格
3. 将 `FormCellData` 转换为 `CellData`（`fieldName` 转为 `{{fieldName}}`）
4. 设置初始行高/列宽
5. 迁移后的数据仅用于编辑，保存时使用新格式

### 5.2 保存时格式

- 始终保存为 `FormExcelConfig` 格式
- 后端兼容：字段表 `formLayoutConfig` 字段存储 JSON
- 渲染时优先使用新格式，旧格式兼容

## 6. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `web/components/form-layout-designer.tsx` | 重写 | 替换为 FormExcelDesigner |
| `web/components/dynamic-form.tsx` | 改造 | 支持新 grid 格式渲染 |
| `web/app/globals.css` | 补充 | 兼容 Excel 样式 |
| `web/types/index.ts` (若存在) | 新增类型 | FormExcelConfig 等 |

## 7. 注意事项

- 旧版 `FormLayoutGroup` 的 `subgroups` 不再支持，迁移时丢弃
- 已保存的旧数据在加载时自动迁移，不影响已有表单
- 单元格渲染性能：大表格（100+行）需考虑虚拟滚动
- 子表字段列表需在渲染时动态加载字段定义