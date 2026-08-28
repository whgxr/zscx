# ONLYOFFICE 正式环境部署与配置

> 适用范围：正式环境上线 ONLYOFFICE 模板编辑器（Word/Excel 文件化模板）。
> 测试机（REDACTED_IP）已跑通，本文档指导正式环境落点。

## 1. 架构

```
用户浏览器
  │
  │  打开 /dashboard/{word,export}-templates/[id]（业务系统 :443/:端口）
  ▼
Next.js（zscx-web）
  │  ① GET /api/export-templates/[id]/office-config  → 返回 JWT 签名编辑器配置
  │  ② 加载 <DS>/web-apps/apps/api/documents/api.js  → DocsAPI.DocEditor()
  ▼
ONLYOFFICE Document Server（独立容器/机器，如 onlyoffice.example.com）
  │  - 拉取 document.url（=业务系统 /api/files/{key}，走 MinIO 代理）
  │  - 用户编辑真实 docx/xlsx
  │  - 保存/强制保存 → POST /api/export-templates/[id]/office-callback（JWT 验签）
  ▼
Next.js 回调 → fetch 编辑后文件 → MinIO(saveObject) → 更新模板 fileKey
```

关键点：
- **业务系统与 DS 相互可达**：DS 必须能访问业务系统的 `document.url` 与 `callbackUrl`；业务系统用户浏览器必须能访问 DS。
- **模板 = 真实 docx/xlsx 文件**（MinIO），`ExportTemplate.documentFileKey`（Word）/ `spreadsheetFileKey`（Excel）记录对象 key。
- 生成文书/导出 = 打开模板文件替换 `{{field}}` 占位符（`lib/office-renderer.ts`），无内存转换模型，合并/公式/样式原样保留。

## 2. 环境变量清单（正式环境必配）

| 变量 | 说明 | 示例 |
|---|---|---|
| `ONLYOFFICE_DS_URL` | Document Server 对外地址（浏览器可达） | `https://onlyoffice.example.com` |
| `ONLYOFFICE_JWT_SECRET` | 与 DS 的 `JWT_SECRET` **完全一致**，用于 config 签名与回调验签 | 随机长串（≥32 字符） |
| `NEXT_PUBLIC_BASE_URL` 或 `APP_PUBLIC_URL` | 业务系统公网地址（用于拼 document.url / callbackUrl） | `https://zs.example.com` |

> 说明：`lib/office-config.ts` 读取顺序 `NEXT_PUBLIC_BASE_URL` → `APP_PUBLIC_URL` → 默认 `http://REDACTED_IP:777`。**正式环境必须配置前两者之一**，否则回调/文档 URL 指向测试机。

## 3. Document Server 部署

### 3.1 镜像与容器（生产建议单独机器或独立容器）
```bash
# 国内镜像源拉取（官方源极慢）
docker pull docker.m.daocloud.io/onlyoffice/documentserver:latest
docker tag docker.m.daocloud.io/onlyoffice/documentserver:latest onlyoffice/documentserver:latest

docker run -d --name onlyoffice-ds \
  --restart unless-stopped \
  -p 8088:80 \
  -e JWT_ENABLED=true \
  -e JWT_SECRET='<与业务系统 ONLYOFFICE_JWT_SECRET 一致>' \
  -v /data/onlyoffice/logs:/var/log/onlyoffice \
  -v /data/onlyoffice/data:/var/www/onlyoffice/Data \
  -v /data/onlyoffice/cache:/var/lib/onlyoffice \
  -v /data/onlyoffice/db:/var/lib/postgresql \
  onlyoffice/documentserver
```

### 3.2 健康检查
```
curl -s https://onlyoffice.example.com/healthcheck   # 期望返回 true
```
首次启动约 15~60s 就绪；如生产走反向代理，确保把 `/web-apps/`、`/cache/`、`/files/`、`/FileConverter` 等路径透传给 DS 容器。

### 3.3 网络拓扑要求
- 业务系统 → DS：需能访问（若 DS 在内网，业务系统容器/服务器需可达）。
- DS → 业务系统：`document.url` 与 `callbackUrl` 必须能被 DS 访问（不能是 localhost；用域名或内网 IP）。
- 两者端口放行：业务系统 443/端口、DS 8088。

## 4. 权限模型

### 4.1 业务系统侧（模板可见/编辑权限）
沿用现有 `ExportTemplate` 权限逻辑，**未做改动**：
- 系统模板：管理员（ADMIN/MANAGER）与创建者可修改/删除。
- 非系统模板：创建者与管理员可修改；其他用户只读（或不可见，视列表过滤）。

### 4.2 编辑器内权限（ONLYOFFICE config.permissions）
由 `lib/office-config.ts` 生成，当前为编辑模板场景：
- `permissions.edit: true`（可编辑）
- `download: true` / `print: true` / `comment: false`
- `editorConfig.mode: 'edit'`、`lang: 'zh-CN'`
- `user.id = 'tpl-{templateId}'`、`user.name = 当前用户姓名`

如需"仅查看"模板（例如普通用户进入只读预览），可将 `buildOfficeConfig` 的 `mode` 传 `'view'`，`permissions.edit` 自动变 `false`。

### 4.3 回调鉴权（防伪造保存）
- DS 在回调请求头携带 `X-Doceditor-Token`（对回调体用 `ONLYOFFICE_JWT_SECRET` 签名）。
- `office-callback` 用 `verifyCallbackToken()` 验签，**验签失败返回 401**，不落库。
- 生产建议：DS 与业务系统之间的网络用内网/防火墙隔离，回调仅接受 DS 来源 IP（可选）。

## 5. 关键实现文件（改动/新增）

| 文件 | 职责 |
|---|---|
| `web/lib/office-config.ts` | DS 地址/密钥、JWT 签名 config、回调验签、`appPublic()` |
| `web/lib/office-renderer.ts` | docx/xlsx 文件占位符替换渲染 |
| `web/lib/storage.ts` | MinIO 对象存储（原有，复用） |
| `web/app/api/export-templates/[id]/office-config/route.ts` | 返回编辑器配置 |
| `web/app/api/export-templates/[id]/office-callback/route.ts` | 保存回调→落 MinIO→更新 fileKey |
| `web/app/api/export-templates/[id]/office-file/route.ts` | 新模板初始化 docx/xlsx |
| `web/components/office/office-template-editor.tsx` | ONLYOFFICE 编辑器组件（Word/Excel 通用） |
| `web/app/dashboard/word-templates/[id]/page.tsx` | Word 设计器（ONLYOFFICE） |
| `web/app/dashboard/export-templates/[id]/page.tsx` | Excel 设计器（ONLYOFFICE） |
| `web/app/api/export/[tableName]/docx/route.ts` | 生成文书（优先文件渲染） |
| `web/app/api/export/[tableName]/excel/route.ts` | Excel 导出（优先文件渲染） |
| `web/prisma/migrate-templates-to-office.ts` | 老模板→文件一次性迁移（`npx tsx` 幂等） |
| 数据库迁移 | `ExportTemplate.documentFileKey/spreadsheetFileKey`（docker-migrate.js step 42 / migrate.js step 41） |

## 6. 上线步骤

1. **部署 DS**（见 §3），记录对外地址。
2. **配置环境变量**（见 §2）到 `.env` / docker-compose，重启 zscx-web。
3. **跑数据库迁移**（容器启动会自动执行 `docker-migrate.js`，确认新增两列）。
4. **老模板迁移**（一次性，幂等）：
   ```bash
   docker exec zscx-web sh -c "cd /app && npx tsx prisma/migrate-templates-to-office.ts"
   ```
5. **冒烟验证**（见 §7）。

## 7. 上线验证清单

- [ ] `https://<DS>/healthcheck` 返回 `true`。
- [ ] 登录业务系统，打开任一 Word 模板：ONLYOFFICE 编辑器正常加载（菜单/工具栏/内容）。
- [ ] 打开 Excel 模板：Spreadsheet 编辑器正常加载。
- [ ] 编辑模板 → 保存（Ctrl+S / 保存按钮）：`office-callback` 日志出现 `saved=...`，DB 中 `documentFileKey/spreadsheetFileKey` 更新为新对象 key。
- [ ] 用模板生成文书/导出：占位符 `{{field}}` 被替换为数据、格式/合并完好；下载可正常打开。
- [ ] 无权限用户不可修改系统模板（403）。

## 8. 运维注意事项

- **DS 按 key 缓存文档**：`office-config` 用文件 key 拼 `document.key`（`tpl-{id}-{kind}-{文件名}`），保存后新文件 key 不同 → DS 自动拉新版本，无需手工清理缓存。
- **MinIO 对象清理**：每次保存生成新对象，旧对象未自动回收；可定期按 `templates/{id}/` 前缀清理非当前引用对象，或接入生命周期策略。
- **DS 版本/升级**：升级 Document Server 前先备份 `JWT_SECRET` 与数据卷；升级后验证 `healthcheck` 与编辑保存。
- **AGPL 授权**：Document Server 社区版为 AGPL，内部系统自用合规；若对外商业化分发需评估商用授权。
- **容器内 next 监听 3000**：容器内自测/回调调试用 `http://localhost:3000`，对外端口映射（如 777/443）由 compose/反代负责。

## 9. 常见问题

| 现象 | 排查 |
|---|---|
| 编辑器报"下载失败" | ① **浏览器装了下载管理器/扩展（如 IDM）**：会接管 ONLYOFFICE 的 `Editor.bin` 下载导致 `-4`，典型表现为"Chrome 报错、360 正常"——卸载/临时停用该工具即可恢复，与 DS 无关；② 模板文件非标准生成（历史手写 xlsx）；③ DS 拉不到 `document.url`（网络/公网地址配置错误）；④ DS key 缓存了坏文件（换新 key/清 DS 缓存）。标准文件用 `office-file` 初始化或 exceljs 重新生成。 |
| 保存后无回调/未落库 | ① `ONLYOFFICE_JWT_SECRET` 与 DS 不一致 → 验签 401；② `callbackUrl` 不可达（业务系统公网地址配置错误）；③ nextjs 用户写权限（应走 MinIO 而非本地目录）。 |
| 占位符未替换 | 模板文件中字段名与数据字段不一致；检查 `{{field}}` 命名（支持 `a.b` 路径）。 |
