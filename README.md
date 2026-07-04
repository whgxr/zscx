# 房屋征收调查系统

一个功能完整的房屋征收调查数据管理系统，支持PC网页端和微信小程序端数据采集。

> 仓库地址：https://github.com/whgxr/zscx

## 功能特性

### 核心功能
- **动态数据表设计**：后台自定义数据表结构，支持20+种字段类型
- **数据录入**：PC端和小程序端均可录入数据，支持图片上传
- **数据查询**：灵活的搜索和筛选功能
- **数据导出**：支持导出Excel和PDF格式
- **权限管理**：细粒度的按表权限控制（查看/新增/编辑/删除/导出）

### 系统架构
- **前端PC端**：Next.js 14 + React + TypeScript + Tailwind CSS + shadcn/ui
- **后端API**：Next.js API Routes（一体化部署）
- **数据库**：MySQL 5.7
- **ORM**：Prisma
- **认证**：JWT + HttpOnly Cookie
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
npx prisma db push
npx prisma db seed
```

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

## 权限系统

### 角色
- **ADMIN (超级管理员)**：全部权限
- **MANAGER (管理员)**：可管理用户和表设计
- **USER (录入员)**：按表分配权限
- **VIEWER (查看员)**：按表分配查看权限

### 权限粒度
每个数据表可以单独设置以下权限：
- 查看
- 新增
- 编辑
- 删除
- 导出

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
```bash
# 在web容器内执行
docker exec -it zscx-web sh
npx prisma db push
npx prisma db seed
exit
```

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
- MySQL 5.7
- JWT 认证
- bcryptjs 密码加密

### 文件上传
- 本地磁盘存储（Docker卷挂载）
- 按月份分目录存储
- 支持图片和文件上传

### CI/CD
- GitHub Actions 自动构建 Docker 镜像
- 推送到 GitHub Container Registry (GHCR)

## License

MIT
