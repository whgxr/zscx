# 土地征收管理系统 · v1.2.2 正式规格说明书 (Spec)

> 文档版本：v1.0-draft  
> 适用版本：征收管理系统 v1.2.2  
> 撰写日期：2026-04-07  
> 状态：待审批 → 审批通过后作为 M1~M4 实施基线

---

## 0. 背景与目标

### 0.1 背景
v1.2.1 及之前系统已完成「调查管理」功能的基本建设（住户信息、土地信息等数据采集）。在实际征收业务中，"调查"只是前置环节，后续还有**征收审批、文书拟定、签字盖章、归档留痕**等一系列动作，这些工作目前仍在线下/离线进行，存在三大痛点：

1. 征收协议必须逐条誊写调查数据，容易抄错且重复劳动；
2. 征收阶段新增/修正数据时缺乏审批留痕，事后无法追溯谁改了什么；
3. 全流程操作（调查改动、审批、文书打印）缺乏统一审计，审计与巡察需求无法满足。

### 0.2 目标（MVP 范围）
| # | 目标 | 度量方式 |
|---|---|---|
| G1 | 新增「征收管理」模块，是「调查管理」在同一系统下的延续 | 侧边栏出现独立 Tab，数据表可归属于任一模块或双端显示 |
| G2 | 征收记录可 1:1 关联调查记录，关联后调查字段**自动带入**，无需重复录入 | 新建征收记录时选择调查户 → 自动回填字段，准确率 100% |
| G3 | 调查数据变更后**不直接改征收数据**，而是生成差异快照，征收负责人**审核确认后**才同步，并永久保留记录 | 任意一次调查改动都能在同步队列里看到 before/after |
| G4 | 征收模块下的新增/修改/同步**必须走审批**，审批流程可由超级管理员以拖拽方式自定义 | 用户无需改代码即可设计「村长→片长→镇长」等任意多级流程 |
| G5 | 提供所见即所得的 **Word/Excel 模板编辑器**，管理员可在页面内直接设计征收协议、公示表、告知书等文书 | 至少支持 3 份标准征收文书的在线设计与 100% 还原度下载打印 |
| G6 | 角色权限升级为**树型勾选**，支持模块级/分类级/表级/操作级四层 | 任意角色均可在一个树节点完成所有权限分配，无需逐表操作 |
| G7 | 超级管理员具备**审计日志中心**，可按 5 大维度（数据/审批/同步/文书/登录）交叉检索并重放变更 | 审计中心 5 个标签页全部可用，过滤条件 ≥10 项，可导出 Excel |
| G8 | 移动端（H5）项目列表自动支持模块切换，征收审批待办统一入口 | H5 首页顶部 Tab 一键切「调查/征收」，待办数字徽标实时显示 |

---

## 1. 项目分类模型（B 方案：分类级模块归属）

### 1.1 模型概述
**采用「项目分类模式（B）」**：
- `调查管理` / `征收管理` 是两条并行的顶级分类分支；
- 每张 `DataTable`（数据表）通过所属分类的 `module` 属性决定归属：`SURVEY`（仅调查）/ `LEVY`（仅征收）/ `BOTH`（两端都可见，例如字典表）；
- 征收记录与调查记录通过 **`LEVY_RELATION` 字段类型**关联（1:1，一户一协议）。

### 1.2 数据模型变更
#### 1.2.1 新增枚举
```prisma
enum CategoryModule { SURVEY LEVY BOTH }
enum FieldType      { ... LEVY_RELATION }
enum RecordStatus   { ... PENDING_APPROVAL CHANGED SYNC_PENDING }
enum SyncSource     { SURVEY LEVY }
enum SyncRequestStatus { PENDING APPROVED REJECTED CANCELLED }
```

#### 1.2.2 新增核心表
- **`DataSnapshot`**：任意记录的 before/after 快照，是审计、同步、审批三大功能的"数据硬盘"。
- **`DataSyncRequest`**：调查改动 → 征收同步 的一次待办请求。

#### 1.2.3 扩展字段
| 表名 | 新增字段 | 含义 |
|---|---|---|
| `TableCategory` | `module` | 分类所属模块 (SURVEY / LEVY / BOTH) |
| `OperationLog` | `snapshotId` / `syncRequestId` / `approvalInstanceId` / `ipAddress` / `userAgent` | 审计中心反查线索 |
| `DataRecord` | 扩展 `status` 枚举 | `PENDING_APPROVAL` 待审批、`CHANGED` 已变更未终审、`SYNC_PENDING` 有调查改动待同步确认 |

### 1.3 LEVY_RELATION 字段
LEVY_RELATION 是专属于「征收表→调查表」的 1:1 关联字段。字段设计师中选中它时必须额外配置：
- **关联的调查数据表** (`levyTableId`)；
- **字段映射**：哪些调查字段要自动带入征收记录的哪些对应字段（name → name、idCard → idCard 等，默认按字段名匹配，可人工调整）；
- **同步模式**：
  - `SNAPSHOT_APPROVAL`（默认，推荐）：调查改动 → 差异快照 → 征收负责人审核 → 写入征收；
  - `DIRECT`：调查改动立即同步（仅用于紧急场景，操作日志会标记 `[DIRECT]`）。

LEVY_RELATION 的选择器 UI 提供：
- 关键字搜索（按调查记录的"姓名/户主/身份证号"等默认文本字段模糊匹配）；
- 已关联记录的排除（防止一证多协议）；
- 点开可查看调查原记录详情（只读抽屉）。

### 1.4 数据变更同步（调查 ↔ 征收）
核心原则：**"快照打底、审核确认、差异重放、痕迹永留"**。

```
 ┌──────────────┐     写入       ┌──────────────┐
 │ 调查数据改动 │──────────────▶ │ DataSnapshot │ ← before / after + diff
 └──────────────┘                └──────┬───────┘
                                        │ 1:N
                                        ▼
                              ┌──────────────────────┐  1条/征收记录
                              │  DataSyncRequest[]   │  status=PENDING
                              └──────────┬───────────┘
                                         │ 进入征收审批列表
                                         ▼
                              ┌──────────────────────┐
                              │ 征收负责人审核窗口    │
                              │ 查看 before/after 差异│
                              └──────┬──────┬────────┘
                          APPROVED │       │ REJECTED
                                   ▼       ▼
                        回写征收记录data   征收记录status保留原值
                        status=REVIEWED    status回退REVIEWED（无其他pending的话）
                        + SYNC_APPLY快照   + SYNC_APPLY_REJECTED日志
```

**验收标准：**  
M1-AC1 数据库已存在 `DataSnapshot`、`DataSyncRequest` 表且索引齐全；  
M1-AC2 字段设计师可选 LEVY_RELATION，并正确配置关联表与映射；  
M1-AC3 后台 API：修改任一调查记录 → 自动生成 1 条 DataSnapshot + N 条 PENDING SyncRequest（N=关联的征收协议数）；  
M1-AC4 审核 APPROVED → 征收记录 data 正确合并、状态为 REVIEWED、再写 1 条 SYNC_APPLY 快照；  
M1-AC5 审核 REJECTED → 征收记录不动、同步请求 REJECTED、写拒绝日志。

---

## 2. 审批流程引擎重做（v2 可视化拖拽版）

### 2.1 为什么重做
当前 1.x 审批流程：
- 流程固化，不能灵活调整"先谁后谁"；
- 不支持会签、或签、条件分支；
- 没有加签、转签、超时自动处理；
- 无法版本化（流程改了历史流程对不上）。

v2 全部打掉重做，**保留旧表 `ApprovalWorkflow / ApprovalNode / ApprovalInstance / ApprovalNodeInstance` 的表名**，但字段扩展（方案中新增 `json_definition`、`version`、`timeoutPolicy`、`triggerEventsConfig` 等），避免引入全新表破坏生态。

### 2.2 流程节点类型
| 节点 | 图标 | 配置项 | 行为 |
|---|---|---|---|
| 发起人 | 👤 | 发起人角色/部门 | 发起端。触发方式：`①手动提交` / `②征收修改保存即自动发起` |
| 审批节点 | ✅ | 审批人（单/会签/或签）、超时策略、允许加签/转签 | 单人或多人审批 |
| 条件分支 | 🔀 | 条件表达式（`amount > 5w`、`levyType === '货币'` 等） | 走不同分支 |
| 并行分支 | ⚖️ | 子节点集合 | 多条线同时审批，全部完成才向下 |
| 抄送 | 📬 | 抄送人 | 不阻塞流程，仅发通知 |
| 结束 | ⏹️ | 无 | 结束并回写记录 status |

### 2.3 两种审批触发（必做）
1. **手动审批（调查数据提报用）**：用户点「提交审批」按钮 → 生成审批实例；
2. **自动审批（征收模块任意改动触发）**：
   - 征收记录在后台做任何保存（新增 / 修改 / 同步通过）
   - **立即自动**生成审批实例，记录 status=PENDING_APPROVAL
   - 所有审批通过才落最终数据 → 落 data 时必须与提交时再做一次**乐观锁**对比（防止审批途中被改）

### 2.4 关键能力
- **流程版本化**：每次发布 +1，历史实例永远绑定当时的版本号，重放链路永远正确；
- **加签 / 转签**：审批人可在节点上"加签一人附议"或"转交给他人"，全部记录到审计；
- **超时策略**：24h / 48h 未处理 → 自动通过 / 自动驳回 / 发通知给上一级；
- **审批流画布**：拖拽组件 → 画布节点 → 连线 → 节点配置抽屉；
- **触发事件配置**：每张表可以分别配置「保存时/提交时/同步时」是否触发审批，以及绑定哪一个流程版本。

### 2.5 验收标准
M2-AC1 流程设计器页面可成功创建、编辑、发布一个 3 级审批流；  
M2-AC2 提交调查/征收记录后正确生成审批实例，节点路由符合设计；  
M2-AC3 会签节点 → 所有批准才过；或签节点 → 任一批准即过；  
M2-AC4 条件分支金额 >5w 走多一层，≤5w 跳层正确；  
M2-AC5 自动触发模式下保存征收改动 → 实例自动生成、记录状态 PENDING_APPROVAL；  
M2-AC6 加签/转签/超时3种操作均生效并有审计日志；  
M2-AC7 审批通过后乐观锁比对：若审批期间记录被其他审批修改 → 拒绝通过并提示用户重新提交。

---

## 3. Word / Excel 在线模板编辑器扩展 + 文书生成打印

### 3.1 现状
目前已有 Excel 模板编辑器（导出模板），但只能设计 Excel，不能设计 Word 类征收文书（征收补偿协议、分户评估报告、限期交出土地告知书……）。

### 3.2 方案（A 方案：在线所见即所得编辑器）
在现有 Excel 模板编辑器基础上**扩展 Word 编辑模式**，使用同一套模板列表入口（加一个"类型 Excel / Word"下拉）。Word 编辑器核心能力：

| 能力 | 细节 |
|---|---|
| 画布 | A4 尺寸（210×297mm，支持 portrait/landscape），分页虚线预览 |
| 字段库（左侧） | 按"当前征收表字段 / 关联调查字段 / 系统字段（盖章日、编号、页码…）"三类组织 |
| 样式 | 字体字号、加粗斜体下划线、颜色、对齐、首行缩进、行距、段距、边框底纹、表格 |
| 表格组件 | 插入 N×M 表格，单元格内部支持 字段 + 公式 =SUM(xx) |
| 条件显示 | `{#if levyType==='货币'}` 段落块显示 / 隐藏 |
| 循环块 | `{#each attachedHouses as house}` 渲染明细表 |
| 图片组件 | 插入二维码、骑缝章占位，生成时动态填入 |
| 预览 | 右侧实时预览（A4 纸面），字段用 🟡 高亮标出 |
| 存储 | 模板 JSON + 生成用 docx.xml 模板双通道保存 |

### 3.3 生成与打印链路
```
 [模板编辑器保存 JSON + .docx template]
                  │
                  ▼
  征收记录详情页 →「文书生成」按钮（弹出模板选择）
                  │
                  ▼
 前端传 recordId + templateId
 后端: 1) 取 record + 关联调查数据 (join)
      2) 走模板引擎合并数据（Excel用ExcelJS、Word用docx.js）
      3) 返回 blob (application/vnd.openxmlformats-officedocument... )
      4) 写 OperationLog = DOC_GENERATE + 记录ID + 模板ID
                  │
                  ▼
 前端 a.href = URL.createObjectURL(blob) → 下载 + window.print() 直打
```

### 3.4 验收标准
M3-AC1 模板编辑器新建 Word 模板，能拖入 5 个字段并做排版；  
M3-AC2 生成的 docx 在 Office/WPS 中 100% 还原（文字/字段/表格/对齐）；  
M3-AC3 模板中使用条件块：真条件显示、假条件不显示；循环块：明细表 n 行 → 渲染 n 行；  
M3-AC4 至少 3 份标准征收文书（征收补偿协议 / 分户公示表 / 告知书）预置模板包可导入；  
M3-AC5 生成记录能在审计中心 DOC 标签看到模板名、操作人、时间、记录 ID；  
M3-AC6 打印按钮 → 直接调起浏览器打印预览，A4 自动分页不跨页断字。

---

## 4. 权限树化改造 + 审计日志中心

### 4.1 权限树化（四级）
现有权限是"每个用户 × 每张表"配置，用户一多就很难维护。改造为：

```
模块级 (调查模块 / 征收模块 / 系统管理)
  └─ 分类级 (调查管理 / 征收管理 / 系统设置 / 字典管理)
       └─ 表级 (住户信息 / 土地信息 / 征收补偿协议 …)
            └─ 操作级 (查看 / 新增 / 编辑 / 删除 / 审批 / 导出 / 打印 / 设计模板 / 配置审批流)
```

- 角色是权限的**集合**；用户可挂**多个角色**，权限取并集；
- UI 用树 + 三态复选框（全选 / 半选 / 未选），父亲勾选 → 所有子孙默认勾选；
- 超管永远最高权限（隐藏一个 hardcode 钩子：userId=1 或 role=ADMIN 时越过 check）；
- 前后端权限校验位置：
  - 前端：菜单隐藏、按钮 disabled（防误点）；
  - 后端：所有写操作 / 读操作均必须 `requirePermission('levy.agreement.edit')`，**防绕过**。

### 4.2 审计日志中心（5 大标签）
入口在系统管理 → 审计中心（仅 ADMIN / 审计角色可见），5 个 Tab：

| Tab | 数据源 | 过滤条件（≥10） | 操作 |
|---|---|---|---|
| 1. 数据操作 | OperationLog (module=DATA) + DataSnapshot | 模块/分类/表/记录/操作人/动作/时间段/IP/关键字 diff | 点行查看 before/after Diff 对比、重放 JSON |
| 2. 审批记录 | OperationLog (module=APPROVAL) + ApprovalInstance | 流程名/版本/发起人/审批人/节点/状态/时间段 | 查看流程图 + 每一步意见 + 附件 |
| 3. 同步记录 | OperationLog (module=SYNC) + DataSyncRequest | 调查/征收表/调查记录/征收记录/状态/审核人/时间段 | 查看 diff、一键跳转记录详情 |
| 4. 文书生成/打印 | OperationLog module=DOC_GENERATE / DOC_PRINT | 模板名/表/记录/操作人/时间段 | 重新下载同版本 docx |
| 5. 登录登出 | OperationLog module=AUTH / LOGIN / LOGOUT | 用户/角色/IP/UA/时间段/成功失败 | 异常登录高亮 |

所有 Tab 支持：导出 Excel、按自定义字段排序、保存常用筛选视图。

### 4.3 验收标准
M4-AC1 角色管理 → 权限树可见，正确展开四级结构，三态复选框有效；  
M4-AC2 给角色配"征收补偿协议.编辑"但不配删除 → 登录后前端看不到删除按钮、后端 DELETE 也返回 403；  
M4-AC3 审计中心 5 个 Tab 均可打开、加载列表、10+ 过滤条件生效；  
M4-AC4 数据操作 Tab 点详情能看到 before/after 双栏 diff 高亮；  
M4-AC5 过滤后可导出 Excel，内容与列表一致；  
M4-AC6 任意 1 条登录异常（外地 IP 或 连续失败）用高亮红行显示。

---

## 5. H5 项目列表改造 + API 路由总览

### 5.1 H5 项目列表改造
- 顶部 Tab：「调查 🔍」 / 「征收 🧾」 + 右上徽标（征收模块 PENDING_APPROVAL + SYNC_PENDING 计数）；
- 每个 Tab 内显示对应分类的项目列表；
- 征收 Tab 里多一个"我的待办"入口卡（跳审批队列）；
- 记录详情：征收记录详情新增「关联调查」抽屉，可点进原调查户档案、查看同步历史。

### 5.2 API 路由总览（RESTful）
#### 5.2.1 模块 / 分类
| Method | Route | 说明 |
|---|---|---|
| GET | `/api/categories?module=SURVEY\|LEVY\|BOTH` | 按模块取分类树（H5 / PC 共用） |

#### 5.2.2 征收记录 / 调查记录（DataRecord 沿用，扩展写入行为）
| Method | Route | 说明 |
|---|---|---|
| GET | `/api/data/{tableName}` | 列表（module 过滤后在 table 层实现） |
| GET | `/api/data/{tableName}/{id}` | 详情（含 LEVY_RELATION 附带调查快照） |
| POST | `/api/data/{tableName}` | 新建（含 LEVY 表时自动写入审批状态 PENDING_APPROVAL） |
| PUT | `/api/data/{tableName}/{id}` | 修改（调查表修改 → 触发同步检测器；征收表修改 → 自动发审批） |
| DELETE | `/api/data/{tableName}/{id}` | 单删 |
| DELETE | `/api/data/{tableName}` | 批量删（ids=[]） |
| GET | `/api/survey-data/{surveyTableName}?keyword=&page=&pageSize=&excludeIds=` | LEVY_RELATION 的"选调查记录"选择器 API |

#### 5.2.3 同步请求（M1 简易审核版，M2 上线后内部改用审批引擎）
| Method | Route | 说明 |
|---|---|---|
| GET | `/api/data-sync-requests?status=&source=&surveyTableId=&levyRecordId=&page=...` | 同步队列查询 |
| POST | `/api/data-sync-requests/{id}/review` | `{ decision: APPROVED\|REJECTED, reviewComment }` → 应用/拒绝同步 |

#### 5.2.4 审批流程（M2）
| Method | Route | 说明 |
|---|---|---|
| CRUD | `/api/workflows` / `/{id}` / `/{id}/publish` | 流程定义与发布（版本化） |
| GET | `/api/workflows/{id}/canvas` | 取画布 JSON |
| POST | `/api/approval-instances` | 手动发起审批 |
| GET | `/api/approval-instances/mine-todo` | 我待审批 |
| POST | `/api/approval-instances/{id}/nodes/{nodeId}/action` | APPROVE / REJECT / COUNTERSIGN / TRANSFER / TIMEOUT |
| GET | `/api/approval-instances/{id}/diagram` | 流程进度图（SVG / React Flow snapshot） |

#### 5.2.5 模板与文书（M3）
| Method | Route | 说明 |
|---|---|---|
| CRUD | `/api/templates` / `/{id}` | 模板元数据 + word/excel 分类 |
| GET | `/api/templates/{id}/editor-data` | 编辑器加载 JSON |
| PUT | `/api/templates/{id}/editor-data` | 保存编辑器 JSON |
| POST | `/api/templates/{id}/generate` | `{ recordId, ... }` → blob docx/xlsx |
| POST | `/api/templates/{id}/print-log` | 记录 DOC_PRINT 审计日志（前端点打印后回传） |

#### 5.2.6 权限与审计（M4）
| Method | Route | 说明 |
|---|---|---|
| GET | `/api/roles/{id}/permission-tree` | 返回该角色当前的权限树勾选状态 |
| PUT | `/api/roles/{id}/permission-tree` | 保存勾选 |
| GET | `/api/audit-logs/{tab}?q=...` | 5 Tab 统一查询（tab = data/approval/sync/doc/auth） |
| POST | `/api/audit-logs/{tab}/export` | 导出 Excel |

---

## 6. 里程碑计划（M1~M4）

### M1：数据地基——分类/关联/同步（本轮已做 80% 实施）
**目标**：Schema、分类模块、LEVY_RELATION、同步检测器全部跑通，**不需要审批流**，同步审核走"后台管理岗单级通过/驳回"的简化版。

| Task | 内容 | 状态 |
|---|---|---|
| T1 | Prisma Schema 扩展（枚举/Snapshot/SyncRequest）| ✅ Done |
| T2 | migrate.js 数据库迁移（列/索引/外键/枚举）| ✅ Done |
| T3 | seed 初始化调查/征收分类 + 示例征收表 + LEVY_RELATION | ✅ Done |
| T4 | snapshot-utils.ts（diff/apply/snapshot） | ✅ Done |
| T5 | levy-sync-detector.ts（同步检测器 + 两种审核回写） | ✅ Done |
| T6 | CRUD API 接入快照钩子 + 同步列表 + 审核 API + 调查选择器 | ✅ Done |
| T7 | tsc typecheck / prisma validate / migrate / seed | ✅ Done |

### M2：审批引擎重做 + 画布设计器 + 两种触发
| Task | 内容 |
|---|---|
| T1 | Schema 扩展：workflow.definition/json、version、triggerEvents、timeoutPolicy；审批实例字段扩展 |
| T2 | 流程引擎核心：解析 canvas JSON → 生成 instance + nodeInstances、节点路由（单批/会批/或批/条件/并行/抄送） |
| T3 | 触发模式：手动提交触发 + 征收保存自动触发（乐观锁保护） |
| T4 | 审批操作：加签/转签/超时策略/驳回重提/撤回 |
| T5 | 流程设计器（React Flow 画布）：节点拖拽、连线、属性抽屉、保存、发布（版本化）、导入导出 |
| T6 | 征收模块表级绑定流程：表 × 触发事件 × 指定流程版本（配置页） |
| T7 | PC 端「我的待办/我发起的」+ 征收记录详情页内嵌审批时间线 |
| T8 | 测试 & 构建：jest test（流程引擎单测覆盖 12 种节点组合）+ next build |

### M3：Word 模板编辑器 + docx.js 渲染 + 打印
| Task | 内容 |
|---|---|
| T1 | 扩展模板实体：类型 Excel/Word、document_json、docx_template_blob、关联表 module 范围 |
| T2 | 编辑器 A4 画布框架（div 伪纸、分页线、标尺） |
| T3 | 字段库面板：当前征收字段 + 关联调查字段 + 系统字段（树型分组） |
| T4 | 富文本段落编辑 + 条件块 {#if} + 循环块 {#each} + 表格（合并单元格/公式） |
| T5 | 生成器：docx.js 渲染（Word）+ ExcelJS（沿用），返回 blob；失败回退错误提示 |
| T6 | 模板导入导出 + 预置模板包 3 份（征收协议/公示表/告知书） |
| T7 | 记录详情"文书生成"按钮：选择模板 → 下载 → 打印预览（print-log 审计） |
| T8 | tsc typecheck + 3 份标准模板生成还原度截图验证 |

### M4：权限树 + 审计中心 + H5 UI 改造 + 总联调
| Task | 内容 |
|---|---|
| T1 | 权限树 Schema：Role 与 PermissionNode 的关系表、编码规则（module.category.table.op）、硬编码 admin 豁免 |
| T2 | 树组件（四级分类 + 三态复选框 + 保存勾选 + 快速全选/清空）|
| T3 | 权限校验中间件：后端 API 全量 requirePermission 改造（DATA/审批/模板/审计 4 类） |
| T4 | 审计中心 5 Tab 页面（Filter 表单 + 表格 + 详情抽屉/弹窗 + 导出） |
| T5 | Diff 重放组件（before/after 双栏 JSON diff 高亮 + 审批流图） |
| T6 | H5 改造：顶部调查/征收 Tab + 徽标待办计数 + 关联调查抽屉 + 审批入口 |
| T7 | 端到端联调（按 AC 清单 28 条全走一遍）+ 压测（1000 条同步请求不重不漏） |
| T8 | 收尾：AC 签字表、部署说明、变更回滚手册 |

---

## 7. 风险 & 回滚预案

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 枚举变更导致旧数据读不出 | 中 | 高 | migrate.js 用 ALTER TABLE MODIFY COLUMN 追加枚举值，**绝不**删旧值 |
| 同步器 race condition（两条 PENDING 同时被审核） | 低 | 中 | 每条 levyRecord 同时只能有一条 PENDING 通过（事务 + SELECT FOR UPDATE 占位锁，M2 补上） |
| 审批乐观锁冲突 | 中 | 中 | 冲突时弹"记录在审批期间已被他人改动"，保留当前草稿让用户重新提交 |
| Word 复杂排版还原度不足 | 高 | 中 | v1 限制：复杂跨页表格 / 分栏 / 图片绕排 不做，引导用"分页表格"；复杂报表仍走 Excel |
| H5 老浏览器打印 | 中 | 低 | 检测 UA：不支持打印 API 时降级为"下载 docx → 用 WPS 打印" |

**回滚预案**：
- 数据库：每次 migrate.js 执行前自动 mysqldump 备份当前库；
- 代码：每个里程碑打 git tag（v1.2.2-m1 / m2 / m3 / m4），出问题一键 `git revert`；
- 开关：系统设置里加 "征收模块启用开关" / "新审批流启用开关" / "新权限树启用开关" 三个 Feature Flag，可随时切回旧行为。

---

## 8. 审批签字
| 角色 | 签字 | 日期 |
|---|---|---|
| 产品/需求确认（甲方业务方）| ____________________ | ______ |
| 技术负责人确认 | ____________________ | ______ |
| 实施负责人确认 | ____________________ | ______ |
