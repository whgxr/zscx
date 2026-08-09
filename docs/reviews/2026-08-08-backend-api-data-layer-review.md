# 后端 API 与数据层维度审查报告

> 审查范围: `web/app/api/` 全部 73 个路由文件, `web/prisma/schema.prisma`, `web/lib/` 核心库  
> 审查日期: 2026-08-08  
> 审查人: 小后 (后端工程师)

---

## 一、API 路由设计合理性与 RESTful 规范度

### P0 - 严重问题

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 1 | **两个路由完全无认证保护** | `web/app/api/qrcode/route.ts` | GET 端点无需认证即可生成二维码，可被滥用为 SSRF 或资源耗尽攻击向量 |
| 2 | **审批超时扫描端点无认证** | `web/app/api/approval/v2/timeout/scan/route.ts` | POST 端点无需认证即可触发超时扫描，任何人可调用 |

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 3 | **错误响应格式不一致** | 全局 | 多数路由返回 `{ message: string }`，但 v2 审批、权限、审计日志等路由返回 `{ ok: false, error: string }`，前端需处理两种错误格式 |
| 4 | **HTTP 方法使用不规范** | `web/app/api/data/[tableName]/route.ts` | DELETE 方法用于批量删除记录但无请求体校验；`/api/profile` 同时使用 POST 和 PUT 修改资料，语义重叠 |
| 5 | **缺少分页标准化** | 多个列表接口 | `/api/tables`、`/api/categories` 等列表接口无统一分页参数规范，部分用 `page/pageSize`，部分无分页 |
| 6 | **路由命名不一致** | `web/app/api/` | 同时存在 `export-templates` 和 `export/templates` 两套导出模板路由；`sync-requests` 和 `data-sync-requests` 功能重叠 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 7 | **缺少 API 版本管理策略** | 全局 | v1 和 v2 审批路由共存，无统一的版本迁移和废弃策略 |
| 8 | **缺少 HATEOAS/链接关系** | 全局 | API 响应无自描述能力，客户端需硬编码 URL 关系 |
| 9 | **批量操作缺少异步模式** | `web/app/api/tables/[id]/fields/batch/route.ts` | 批量字段操作同步执行，大数据量时可能超时 |

---

## 二、Prisma 数据模型设计、关联关系和索引策略

### P0 - 严重问题

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 10 | **Schema 与迁移脚本存在漂移** | `web/prisma/schema.prisma` vs `web/prisma/migrate.js` | `DataSyncRequest.snapshotId` 在 migrate.js 中标记为 UNIQUE，但 schema.prisma 中无 `@unique`；`ApprovalNode` 的 28 列删除在 migrate-approval-nodes.js 中完成但 schema 已是迁移后状态。若运行 `prisma migrate dev` 将产生冲突 |
| 11 | **TableField 缺少业务唯一约束** | `web/prisma/schema.prisma` | `TableField` 模型缺少 `@@unique([tableId, name])` 约束，同一表可存在同名字段 |

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 12 | **ErrorLog 无任何外键关系** | `web/prisma/schema.prisma:506-527` | `userId`、`tableId`、`recordId` 字段无 `@relation` 声明，删除关联实体时不会自动置空，产生悬空引用 |
| 13 | **动态字段验证完全依赖应用层** | `web/prisma/schema.prisma` DataRecord.data | 核心 `data Json` 列无任何数据库级校验，字段级 `required`、`unique`、`validation` 规则仅在应用代码中执行 |
| 14 | **UserSession 无清理机制** | `web/prisma/schema.prisma` | 过期会话无数据库级 TTL 或定时清理，`UserSession` 表将持续增长 |
| 15 | **onDelete 策略不一致** | `web/prisma/schema.prisma` vs `web/prisma/migrate.js` | Schema 中 `DataRecord.table` 无 onDelete（默认 Restrict），但 migrate.js 中 `RecordAttachment` 使用 CASCADE；两者定义不一致 |
| 16 | **ApprovalWorkflow 版本无唯一约束** | `web/prisma/schema.prisma` | 缺少 `@@unique([tableId, version])`，无法在数据库层面防止同一表同一版本号的重复工作流 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 17 | **迁移策略不统一** | `web/prisma/migrate.js` + `docker-migrate.js` + `migrate-approval-nodes.js` | 三套迁移脚本使用不同策略（mysql2 直连 vs PrismaClient），未使用 Prisma Migrate，无法追踪迁移历史 |
| 18 | **updatedAt 管理分裂** | `web/prisma/migrate.js` vs `web/prisma/docker-migrate.js` | migrate.js 使用 MySQL BEFORE UPDATE 触发器，docker-migrate.js 使用 `ON UPDATE CURRENT_TIMESTAMP(3)`，Prisma schema 使用 `@updatedAt`，三种机制可能冲突 |
| 19 | **软删除策略不一致** | `web/prisma/schema.prisma` | 仅 `NotificationRead` 使用 `isDeleted` 软删除，其他所有模型均为硬删除 |

---

## 三、安全性

### P0 - 严重（必须立即修复）

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 20 | **登录端点无速率限制** | `web/app/api/auth/login/route.ts` | 无暴力破解防护，攻击者可无限次尝试密码 |
| 21 | **无账户锁定机制** | `web/app/api/auth/login/route.ts` | 连续失败登录无账户锁定或延迟机制 |
| 22 | **上传文件无认证访问** | `web/app/api/upload/route.ts` | 文件存储在 `public/uploads/` 目录，Next.js 静态服务无需认证即可下载，敏感附件可被直接访问 |

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 23 | **无安全响应头** | `web/next.config.js` | 缺少 `Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options`、`Strict-Transport-Security`、`Referrer-Policy`、`Permissions-Policy` |
| 24 | **OAuth 回调存在开放重定向** | `web/app/api/third-party/wework/auth/route.ts`, `web/app/api/third-party/feishu/auth/route.ts` | `redirectUri` 参数无内部 URL 校验，可被构造为恶意外部地址 |
| 25 | **数据创建端点缺少 Zod 校验** | `web/app/api/data/[tableName]/route.ts` POST | `data` 字段无 Zod 校验，原始 JSON 直接存入数据库 |
| 26 | **角色管理缺少输入校验** | `web/app/api/roles/route.ts` POST, `web/app/api/roles/[id]/route.ts` PUT | 仅检查 `if (!name || !label)`，无长度限制、无字符限制、无 Zod |
| 27 | **系统设置端点无键名校验** | `web/app/api/settings/route.ts` PUT | 接受任意键值对，无白名单校验 |
| 28 | **错误日志端点权限过宽** | `web/app/api/error-logs/route.ts` POST | 任何已认证用户均可写入错误日志条目 |
| 29 | **WeChat 自动创建用户风险** | `web/app/api/auth/wechat/callback/route.ts` | 微信回调自动创建用户（roleId=3），若微信配置被攻破可导致未授权账户创建 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 30 | **无 CSRF Token 机制** | 全局 | 依赖 `sameSite: lax` Cookie 和 JSON Content-Type 隐式防护，未实现显式 CSRF Token |
| 31 | **认证检查分散在各路由** | 全局 | 无 Next.js middleware 统一认证，每个路由需手动调用 `getCurrentUser()`，新增路由易遗漏 |
| 32 | **无 CORS 显式配置** | `web/next.config.js` | 依赖 Next.js 默认行为，无显式 CORS 策略声明 |

---

## 四、错误处理和异常恢复机制

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 33 | **错误响应格式不统一** | 全局 | 存在 `{ message }` 和 `{ ok, error }` 两种错误格式，增加前端处理复杂度 |
| 34 | **部分端点静默吞掉错误** | `web/app/api/attachments/[tableName]/count/route.ts` | 捕获异常后返回 `{ counts: {} }` 而非错误状态码，前端无法区分"无数据"和"查询失败" |
| 35 | **logout 端点掩盖失败** | `web/app/api/auth/logout/route.ts` | 捕获异常后仍返回 `{ success: true }`，客户端无法感知登出失败 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 36 | **缺少全局错误边界** | 全局 | 无统一的 API 错误处理中间件，每个路由独立实现 try-catch |
| 37 | **缺少重试机制** | 全局 | 数据库操作失败后无自动重试逻辑（事务超时、连接池耗尽等场景） |

---

## 五、数据一致性和事务处理

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 38 | **表克隆缺少事务完整性保护** | `web/app/api/tables/[id]/clone/route.ts` | 虽然使用了事务，但克隆涉及表定义、字段、权限、数据记录等多个实体，部分失败时的回滚完整性需验证 |
| 39 | **审批引擎事务超时设置较长** | `web/lib/engine/workflow-engine.ts` | `maxWait: 60_000, timeout: 120_000`（60s/120s），高并发时可能导致连接池耗尽 |
| 40 | **动态数据缺少业务级唯一约束** | `web/app/api/data/[tableName]/route.ts` | 如身份证号等业务唯一性无法在 JSON 数据列上实现数据库级约束，仅靠应用层校验 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 41 | **缺少乐观并发控制** | 多个 PUT 端点 | 仅审批 v2 node-actions 使用 409 状态码，其他更新端点无版本冲突检测 |
| 42 | **级联删除范围过大** | `web/prisma/schema.prisma` | `ApprovalInstance.record -> DataRecord` 使用 `onDelete: Cascade`，删除数据记录将连带删除所有审批实例 |

---

## 六、核心业务逻辑健壮性

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 43 | **审批 v2 多个端点缺少 Zod 校验** | `web/app/api/approval/v2/` 下多个路由 | `node-actions`、`instances`、`table-binding`、`auto-trigger/levy-save` 等使用手动 `body.xxx` 检查而非 Zod |
| 44 | **数据库恢复执行任意 SQL** | `web/app/api/database/restore/route.ts` | 虽为管理员专用，但恢复功能执行文件中的 SQL，若管理员账户被攻破可执行任意 SQL |
| 45 | **导出模板渲染无资源限制** | `web/app/api/export/[tableName]/docx/route.ts` | Word 导出渲染无超时或内存限制，大模板可能导致进程崩溃 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 46 | **审批超时扫描无并发控制** | `web/app/api/approval/v2/timeout/scan/route.ts` | 无分布式锁或幂等保护，多次并发调用可能导致重复处理 |
| 47 | **数据同步触发缺少幂等保护** | `web/lib/levy-sync-detector.ts` | `triggerSyncForSurveyRecordIfNeeded()` 在并发场景下可能产生重复同步请求 |

---

## 七、日志记录和审计追踪完整性

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 48 | **审计日志覆盖不完整** | 全局 | 部分路由（如 `dashboard-config` PUT、`settings` PUT）缺少 `OperationLog` 写入 |
| 49 | **缺少结构化日志框架** | 全局 | 使用 `console.error()` 输出错误，无结构化日志（无请求 ID、无 trace ID、无日志级别路由） |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 50 | **审计日志缺少 IP/UserAgent 标准化** | 全局 | 部分路由记录 IP 和 UserAgent（如登录），但多数数据操作路由未记录 |
| 51 | **无日志归档和清理策略** | `web/prisma/schema.prisma` OperationLog | OperationLog 表无自动归档或清理机制，长期运行后数据量将显著增长 |

---

## 八、接口文档和类型定义完整性

### P1 - 高优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 52 | **无 API 文档** | 全局 | 无 OpenAPI/Swagger 规范，无 JSDoc 注释，接口契约仅靠前端代码推断 |
| 53 | **Zod Schema 未复用为类型定义** | 全局 | 各路由内联定义 Zod schema 但未导出为共享类型，前端无法自动生成类型 |

### P2 - 中优先级

| # | 问题 | 文件路径 | 说明 |
|---|------|----------|------|
| 54 | **缺少 API 响应类型标准化** | 全局 | 成功响应格式不统一：有的返回数据对象，有的包装在 `{ data: ... }` 中，有的直接返回数组 |
| 55 | **缺少请求参数类型导出** | 全局 | 分页、排序、筛选参数无统一的 TypeScript 类型定义 |

---

## 改进优先级汇总

### P0 - 立即修复（安全/数据完整性风险）
1. `/api/qrcode` 和 `/api/approval/v2/timeout/scan` 添加认证保护
2. 登录端点添加速率限制和账户锁定
3. 上传文件目录添加访问控制
4. 修复 Schema 与迁移脚本漂移
5. 添加 `TableField` 唯一约束

### P1 - 短期修复（1-2 个迭代周期）
6. 统一错误响应格式
7. 添加安全响应头（CSP, HSTS 等）
8. 修复 OAuth 开放重定向
9. 为所有数据创建/更新端点添加 Zod 校验
10. 修复 ErrorLog 外键关系
11. 添加 UserSession 清理机制
12. 统一认证中间件
13. 完善审计日志覆盖
14. 添加 API 文档

### P2 - 中期改进（3-6 个月）
15. 统一迁移策略（迁移到 Prisma Migrate 或统一现有脚本）
16. 标准化路由命名和版本管理
17. 添加 CSRF Token 机制
18. 实现结构化日志框架
19. 添加乐观并发控制
20. 导出共享类型定义供前端复用

---

## 安全亮点（已做得好的方面）

- Prisma 参数化查询全面防止 SQL 注入
- 文件上传使用 magic byte 验证 + 扩展名白名单
- Shell 命令使用环境变量传递密码 + `escapeShellArg()` 防注入
- Excel 导出阻止危险公式函数（`sanitizeCellValue`）
- 错误日志自动脱敏敏感数据（password, token, secret 等）
- JWT + httpOnly Cookie + 数据库会话管理三重认证架构
- 审批引擎使用带超时的交互式事务
