# 房屋征收调查系统

一个功能完整的房屋征收调查数据管理系统，支持PC网页端和微信小程序端数据采集。

> 仓库地址：https://github.com/whgxr/zscx

## 功能特性

### 核心功能
- **动态数据表设计**：后台自定义数据表结构，支持20+种字段类型
- **数据录入**：PC端和小程序端均可录入数据，支持图片上传
- **数据查询**：灵活的搜索和筛选功能
- **数据导入**：Excel批量导入数据，支持字段映射
- **数据导出**：支持Excel和PDF格式，4种导出类型（标准/卡片/分组/表单）
- **导出模板**：可保存导出配置为模板，一键重复使用
- **分类管理**：数据表分类，支持拖拽排序
- **版本管理**：版本日志发布与管理，支持同步显示
- **错误日志**：系统错误记录与查看
- **个人资料**：查看和修改个人信息，修改登录密码
- **权限管理**：细粒度的按表权限控制（查看/新增/编辑/删除/导出）

### 安全特性
- **单设备登录**：一个账号只能在一个设备上登录，新设备登录自动踢掉旧设备
- **会话超时**：用户不操作自动退出登录（默认30分钟，可配置）
- **JWT认证**：HttpOnly Cookie 存储，安全可靠
- **密码加密**：bcryptjs 加密存储

### 系统集成
- **微信登录**：支持微信小程序登录
- **飞书集成**：飞书 webhook 消息推送
- **仪表盘配置**：自定义首页展示内容

### 系统架构
- **前端PC端**：Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui
- **后端API**：Next.js API Routes（一体化部署）
- **数据库**：MySQL 5.7+
- **ORM**：Prisma
- **认证**：JWT + HttpOnly Cookie + UserSession 会话管理
- **微信小程序**：原生小程序
- **部署**：Docker + Docker Compose

## 项目结构

```
zscx/
├── web/                     # Web前端 + 后端API (Next.js)
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API路由
│   │   ├── dashboard/       # 管理后台页面
│   │   └── login/           # 登录页
│   ├── components/          # React组件
│   │   ├── ui/              # shadcn/ui组件
│   │   └── layout/          # 布局组件
│   ├── lib/                 # 工具库
│   ├── prisma/              # 数据库模型和种子数据
│   ├── public/              # 静态资源和上传文件
│   └── Dockerfile
├── miniprogram/             # 微信小程序
│   ├── pages/               # 小程序页面
│   ├── app.js               # 小程序入口
│   └── app.json             # 小程序配置
├── docker/                  # Docker部署配置（源码构建方式）
│   ├── docker-compose.yml   # Compose配置文件
│   ├── .env.example         # 环境变量模板
│   ├── deploy.sh            # Linux一键部署脚本
│   ├── deploy.bat           # Windows一键部署脚本
│   ├── backup.sh / .bat     # 数据备份脚本
│   ├── restore.sh / .bat    # 数据恢复脚本
│   └── DEPLOY.md            # 详细部署文档
├── docker-nas/              # NAS专用部署配置（镜像拉取方式）
│   ├── docker-compose.yml   # 使用GHCR预构建镜像
│   ├── .env.example         # 环境变量模板
│   └── README.md            # NAS部署指南
├── .github/workflows/       # GitHub Actions 自动构建镜像
│   └── docker-build.yml
├── push.sh / push.bat       # 一键推送代码到GitHub
└── README.md
```

## 快速开始

### 方式一：Docker 源码构建部署（推荐）

适用于服务器/NAS，直接从源码构建镜像。

1. 克隆项目
```bash
git clone https://github.com/whgxr/zscx.git
cd zscx/docker
```

2. 复制环境变量配置
```bash
cp .env.example .env
```

3. 修改 `.env` 中的配置（特别是密码和密钥）
```bash
# Linux/Mac
nano .env
# Windows
notepad .env
```

4. 启动服务
```bash
docker compose up -d --build
```

5. 访问系统
   - 前端：http://localhost:3000
   - 默认管理员：admin / admin123

### 方式二：Docker 镜像拉取部署（NAS 推荐）

使用 GitHub Actions 自动构建的镜像，NAS 无需源码，压力更小。

1. 将 `docker-nas/` 目录下的文件上传到 NAS
2. 配置环境变量
```bash
cp .env.example .env
# 编辑 .env 修改密码和密钥
```

3. 拉取镜像并启动
```bash
docker compose pull
docker compose up -d
```

> 详细说明请参考 [docker-nas/README.md](docker-nas/README.md)

### 方式三：本地开发

#### 环境要求
- Node.js 18+
- MySQL 5.7+

#### 安装步骤

1. 安装依赖
```bash
cd web
npm install
```

2. 配置环境变量
```bash
cp .env.example .env
# 修改 .env 中的数据库连接信息
```

3. 初始化数据库
```bash
npm run db:init
```

> 注意：使用自定义迁移脚本 `npm run db:init` 而非 `prisma db push`，以确保 MySQL 5.5 兼容性。

4. 启动开发服务器
```bash
npm run dev
```

5. 访问 http://localhost:3000

## 默认账号

| 角色 | 用户名 | 密码 | 说明 |
|------|--------|------|------|
| 超级管理员 | admin | admin123 | 全部权限 |
| 录入员 | user01 | 123456 | 可录入和编辑数据 |
| 查看员 | viewer01 | 123456 | 只能查看和导出 |

> 安全提示：部署后请立即修改默认密码！

## 功能模块

### 数据表管理

- **动态设计**：可视化设计表结构，支持字段拖拽排序
- **字段类型丰富**：支持20+种字段类型
- **表克隆**：一键复制表结构
- **字段批量操作**：批量添加、修改字段

### 数据管理

- **数据录入**：PC端表单录入，支持图片/文件上传
- **数据编辑**：行内编辑或详情页编辑
- **数据查询**：多条件搜索、高级筛选
- **数据导入**：Excel批量导入，支持字段映射配置
- **数据导出**：Excel/PDF导出，4种导出类型

### 分类管理

- 数据表分类归档
- 拖拽调整分类顺序
- 分类启用/停用
- 分类图标和颜色配置

### 版本管理

- 版本日志发布
- 版本号管理
- 版本内容富文本编辑
- 版本同步展示到前端

### 导出模板

- **Excel模板设计器**：可视化设计导出模板
- **公式支持**：支持Excel公式计算
- **页面布局**：自定义页眉页脚、页边距
- **模板分类**：系统模板和用户自定义模板
- **设为默认**：一键导出，无需重复配置

### 权限系统

#### 角色
- **ADMIN (超级管理员)**：全部权限
- **MANAGER (管理员)**：可管理用户和表设计
- **USER (录入员)**：按表分配权限
- **VIEWER (查看员)**：按表分配查看权限

#### 权限粒度
每个数据表可以单独设置以下权限：
- 查看
- 新增
- 编辑
- 删除
- 导出

### 安全与会话

#### 单设备登录
- 一个账号同时只能在一个设备上登录
- 新设备登录后，旧设备自动被踢下线
- 前端实时检测会话状态（30秒轮询）
- 被踢下线时弹出提示并跳转登录页

#### 会话超时
- 用户不操作自动退出登录
- 超时时间可配置（默认30分钟）
- 在系统设置中调整超时时间

### 系统设置

- 站点名称配置
- 会话超时时间设置
- 飞书 webhook 配置
- 仪表盘配置

### 错误日志

- 自动记录系统错误
- 错误详情查看
- 错误发生时间和用户信息
- 支持按时间筛选

## 支持的字段类型

- TEXT - 单行文本
- TEXTAREA - 多行文本
- NUMBER / INTEGER / FLOAT - 数字
- MONEY - 金额
- DATE / DATETIME - 日期/时间
- SELECT / RADIO - 单选
- MULTISELECT / CHECKBOX - 多选
- UPLOAD_IMAGE - 图片上传
- UPLOAD_FILE - 文件上传
- PHONE - 手机号
- EMAIL - 邮箱
- IDCARD - 身份证号
- ADDRESS - 地址
- SWITCH - 开关
- RICHTEXT - 富文本
- RELATION - 关联表

## 数据导出功能

系统支持丰富的数据导出功能，Excel 和 PDF 两种格式均支持以下 4 种导出类型：

### 导出类型

| 类型 | 说明 | 适用场景 |
|------|------|----------|
| **标准列表** | 传统行列表格格式，一条记录一行 | 数据汇总、批量查看 |
| **卡片式** | 每条记录一个卡片，字段竖向排列 | 档案打印、信息卡 |
| **分组汇总** | 按指定字段分组，含汇总统计 | 分类统计、报表 |
| **表单式** | 每条记录一个表单页，Excel每个记录一个Sheet | 正式文档、档案表 |

### 自定义功能
- **字段选择**：自由选择要导出的字段，支持调整顺序
- **样式设置**：斑马纹、边框、列宽等
- **卡片布局**：卡片式可设置每行卡片数（1/2/3列）
- **分组字段**：分组汇总可选择分组依据字段
- **表单布局**：表单式可设置每行列数（1/2列）

### 导出模板
- 可将导出配置（类型、字段、样式）保存为模板
- 支持系统模板和用户自定义模板
- 可设置默认模板，一键导出
- 模板管理：创建、删除、设为默认

### 使用方式
1. 进入任意数据表页面
2. 点击右上角 **Excel** 或 **PDF** 按钮
3. 在弹出的导出对话框中：
   - 选择导出格式（Excel/PDF）
   - 选择导出类型
   - 选择要导出的字段并调整顺序
   - 设置样式选项
   - （可选）保存为模板
4. 点击 **导出** 按钮下载文件

## 个人资料

点击右上角头像 → **个人资料** 可进入个人资料页面：

- **基本信息**：查看和修改真实姓名、手机号、邮箱
- **修改密码**：输入旧密码和新密码修改登录密码
- **账号信息**：查看用户名、角色、账号状态、注册时间

## 微信小程序

### 开发步骤
1. 用微信开发者工具打开 `miniprogram` 目录
2. 修改 `app.js` 中的 `baseUrl` 为你的API地址
3. 配置小程序后台的服务器域名
4. 预览或上传发布

### 小程序功能
- 用户登录
- 数据表列表
- 数据列表（搜索、分页）
- 数据详情
- 新增/编辑数据
- 拍照/选图上传
- 个人中心

## 部署更新

### 方式一：源码构建更新
```bash
cd zscx
git pull
cd docker
docker compose up -d --build
```

### 方式二：镜像拉取更新
```bash
cd /你的部署目录
docker compose pull
docker compose up -d
```

### 数据库迁移
项目使用自定义迁移脚本，兼容 MySQL 5.5+：
```bash
# 在web容器内执行
docker exec -it zscx-web sh
node prisma/docker-migrate.js
npx prisma db seed
exit
```

> 注意：不使用 `prisma db push`，避免 MySQL 版本兼容性问题。

## 数据备份与恢复

项目自带备份恢复脚本，位于 `docker/` 目录下：

```bash
# Linux/Mac
./backup.sh     # 备份数据
./restore.sh    # 恢复数据

# Windows
backup.bat      # 备份数据
restore.bat     # 恢复数据
```

手动备份：
```bash
# 备份数据库
docker exec zscx-mysql mysqldump -u root -p你的密码 --databases zscx --single-transaction | gzip > backup_$(date +%Y%m%d).sql.gz

# 备份上传文件
docker run --rm -v zscx_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d).tar.gz -C /data .
```

> 完整部署文档请参考 [docker/DEPLOY.md](docker/DEPLOY.md)

## 常用命令

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止服务
docker compose down

# 启动服务
docker compose up -d
```

## 技术栈说明

### 前端
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui (Radix UI)
- Lucide Icons

### 后端
- Next.js API Routes
- Prisma ORM
- MySQL 5.7+
- JWT 认证
- bcryptjs 密码加密
- UserSession 会话管理

### 文件上传
- 本地磁盘存储（Docker卷挂载）
- 按月份分目录存储
- 支持图片和文件上传

### 集成
- 微信小程序登录
- 飞书 Webhook

### CI/CD
- GitHub Actions 自动构建 Docker 镜像
- 推送到 GitHub Container Registry (GHCR)

## 更新日志

### v1.1.1
- ✅ 新增：单设备登录功能（新设备登录自动踢掉旧设备）
- ✅ 新增：会话超时自动退出（默认30分钟，可配置）
- ✅ 新增：数据表分类管理（支持拖拽排序）
- ✅ 新增：版本日志管理与发布
- ✅ 新增：Excel数据导入功能（支持字段映射）
- ✅ 新增：系统错误日志记录与查看
- ✅ 新增：飞书 webhook 集成
- ✅ 新增：仪表盘配置功能
- ✅ 优化：数据库迁移脚本，兼容 MySQL 5.5+
- 🐛 修复：被踢下线后刷新页面出现服务端异常的问题

## License

MIT
