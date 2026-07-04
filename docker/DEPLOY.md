# 房屋征收调查系统 - Docker 部署与更新手册

## 目录
- [一、环境准备](#一环境准备)
  - [1.1 系统要求](#11-系统要求)
  - [1.2 Docker 安装（Linux）](#12-docker-安装linux)
  - [1.3 Docker 安装（Windows）](#13-docker-安装windows)
  - [1.4 Docker Compose 安装](#14-docker-compose-安装)
- [二、首次部署](#二首次部署)
  - [2.1 方式一：从 GitHub 拉取源码构建（推荐）](#21-方式一从-github-拉取源码构建推荐)
  - [2.2 方式二：使用预构建镜像](#22-方式二使用预构建镜像)
- [三、配置说明](#三配置说明)
  - [3.1 环境变量配置](#31-环境变量配置)
  - [3.2 端口配置](#32-端口配置)
  - [3.3 数据持久化](#33-数据持久化)
- [四、系统更新](#四系统更新)
  - [4.1 常规更新流程](#41-常规更新流程)
  - [4.2 一键更新脚本](#42-一键更新脚本)
  - [4.3 数据库迁移](#43-数据库迁移)
- [五、常用操作命令](#五常用操作命令)
  - [5.1 服务管理](#51-服务管理)
  - [5.2 日志查看](#52-日志查看)
  - [5.3 容器操作](#53-容器操作)
- [六、数据备份与恢复](#六数据备份与恢复)
  - [6.1 数据库备份](#61-数据库备份)
  - [6.2 数据库恢复](#62-数据库恢复)
  - [6.3 上传文件备份](#63-上传文件备份)
- [七、常见问题](#七常见问题)

---

## 一、环境准备

### 1.1 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| 操作系统 | Linux (Ubuntu 20.04+/CentOS 7+) / Windows 10+ | Ubuntu 22.04 LTS |
| CPU | 2 核 | 4 核及以上 |
| 内存 | 2 GB | 4 GB 及以上 |
| 硬盘 | 20 GB 可用空间 | 50 GB 及以上 SSD |
| Docker | 20.10+ | 最新稳定版 |
| Docker Compose | 1.29+ / 2.0+ | 最新稳定版 |

---

### 1.2 Docker 安装（Linux）

#### Ubuntu / Debian 系统

```bash
# 1. 更新软件包索引
sudo apt-get update

# 2. 安装必要的依赖包
sudo apt-get install -y ca-certificates curl gnupg lsb-release

# 3. 添加 Docker 官方 GPG 密钥
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# 4. 设置 Docker 稳定版仓库
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 5. 安装 Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 6. 验证安装
docker --version
docker compose version

# 7. 设置 Docker 开机自启（推荐）
sudo systemctl enable docker
sudo systemctl start docker

# 8. 将当前用户添加到 docker 组（避免每次用 sudo）
sudo usermod -aG docker $USER

# 注销并重新登录，或执行以下命令使组设置生效
newgrp docker
```

#### CentOS / RHEL 系统

```bash
# 1. 安装必要的依赖包
sudo yum install -y yum-utils

# 2. 添加 Docker 仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 3. 安装 Docker Engine
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 4. 启动 Docker 并设置开机自启
sudo systemctl start docker
sudo systemctl enable docker

# 5. 验证安装
docker --version
docker compose version

# 6. 将当前用户添加到 docker 组
sudo usermod -aG docker $USER
newgrp docker
```

---

### 1.3 Docker 安装（Windows）

#### Windows 10/11 专业版/企业版（推荐使用 WSL2）

1. **启用 WSL2**
   ```powershell
   # 以管理员身份运行 PowerShell
   wsl --install
   ```
   安装完成后重启电脑。

2. **下载并安装 Docker Desktop**
   - 访问 [Docker 官网](https://www.docker.com/products/docker-desktop/)
   - 下载 Docker Desktop for Windows
   - 运行安装程序，确保勾选 "Use WSL 2 instead of Hyper-V"

3. **验证安装**
   打开 PowerShell 或 CMD：
   ```powershell
   docker --version
   docker compose version
   ```

---

### 1.4 Docker Compose 安装

> 注意：Docker Desktop 和较新版本的 Docker Engine 已内置 `docker compose` 命令（v2），无需单独安装。

如果使用旧版本 Docker，可按以下方式安装 docker-compose（v1）：

```bash
# Linux 系统
sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 验证
docker-compose --version
```

---

## 二、首次部署

### 2.1 方式一：从 GitHub 拉取源码构建（推荐）

适用于有代码仓库访问权限，需要自定义部署的场景。

#### 步骤 1：克隆代码仓库

```bash
# 使用 HTTPS 方式
git clone https://github.com/你的用户名/zscx.git

# 或使用 SSH 方式
git clone git@github.com:你的用户名/zscx.git

# 进入项目目录
cd zscx
```

#### 步骤 2：进入 Docker 配置目录

```bash
cd docker
```

#### 步骤 3：配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑配置文件（Linux/Mac）
nano .env

# 或使用 vim
vim .env
```

**重要：** 请务必修改以下配置项：
- `MYSQL_ROOT_PASSWORD` - MySQL root 密码
- `MYSQL_PASSWORD` - 应用数据库用户密码
- `JWT_SECRET` - JWT 加密密钥（生产环境必须修改为随机字符串）

生成随机 JWT_SECRET：
```bash
# Linux / Mac
openssl rand -hex 32

# Windows PowerShell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) })
```

#### 步骤 4：启动服务

```bash
# 构建并启动所有服务（后台运行）
docker compose up -d --build

# 旧版 docker-compose v1
docker-compose up -d --build
```

#### 步骤 5：等待服务启动

首次启动需要约 1-3 分钟，包括：
- 拉取 MySQL 5.7 镜像
- 构建 Next.js 应用镜像
- 初始化数据库表结构
- 导入初始数据

```bash
# 查看启动日志
docker compose logs -f

# 查看容器运行状态
docker compose ps
```

#### 步骤 6：访问系统

打开浏览器访问：
- 地址：`http://服务器IP:3000`
- 默认管理员账号：`admin` / `admin123`

> **安全提示：** 首次登录后请立即修改默认管理员密码！

---

### 2.2 方式二：使用预构建镜像

如果已将镜像推送到 Docker Registry，可直接使用镜像部署，无需本地构建。

#### 步骤 1：准备 docker-compose.yml

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  mysql:
    image: mysql:5.7
    container_name: zscx-mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:-root123456}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-zscx}
      MYSQL_USER: ${MYSQL_USER:-zscx}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:-zscx123456}
    ports:
      - "${MYSQL_PORT:-3306}:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    command:
      --character-set-server=utf8mb4
      --collation-server=utf8mb4_unicode_ci
      --max_connections=1000
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot123456"]
      interval: 10s
      timeout: 5s
      retries: 5

  web:
    image: 你的镜像地址/zscx-web:latest  # 替换为实际镜像地址
    container_name: zscx-web
    restart: always
    ports:
      - "${WEB_PORT:-3000}:3000"
    environment:
      - DATABASE_URL=mysql://${MYSQL_USER:-zscx}:${MYSQL_PASSWORD:-zscx123456}@mysql:3306/${MYSQL_DATABASE:-zscx}
      - JWT_SECRET=${JWT_SECRET:-change-this-secret-in-production}
      - JWT_EXPIRES_IN=7d
      - UPLOAD_DIR=./public/uploads
      - MAX_FILE_SIZE=10485760
      - NEXT_PUBLIC_APP_NAME=${APP_NAME:-房屋征收调查系统}
      - NODE_ENV=production
    depends_on:
      mysql:
        condition: service_healthy
    volumes:
      - uploads:/app/public/uploads
    command: sh -c "npx prisma db push && npx prisma db seed && npm start"

volumes:
  mysql_data:
  uploads:
```

#### 步骤 2：拉取镜像并启动

```bash
# 拉取最新镜像
docker compose pull

# 启动服务
docker compose up -d
```

---

## 三、配置说明

### 3.1 环境变量配置

所有配置项均在 `docker/.env` 文件中设置：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MYSQL_ROOT_PASSWORD` | `root123456` | MySQL root 用户密码（生产环境必须修改） |
| `MYSQL_DATABASE` | `zscx` | 数据库名称 |
| `MYSQL_USER` | `zscx` | 应用数据库用户名 |
| `MYSQL_PASSWORD` | `zscx123456` | 应用数据库密码（生产环境必须修改） |
| `MYSQL_PORT` | `3306` | MySQL 映射到主机的端口 |
| `WEB_PORT` | `3000` | Web 应用映射到主机的端口 |
| `APP_NAME` | `房屋征收调查系统` | 系统显示名称 |
| `JWT_SECRET` | `please-change-this-secret...` | JWT 签名密钥（生产环境必须修改） |

### 3.2 端口配置

如果服务器上 3000 或 3306 端口已被占用，可修改 `.env` 文件中的端口映射：

```env
# 修改 Web 访问端口为 8080
WEB_PORT=8080

# 修改 MySQL 端口为 3307
MYSQL_PORT=3307
```

### 3.3 数据持久化

系统使用 Docker 卷（Volume）持久化数据，确保容器删除后数据不丢失：

| 卷名 | 挂载路径 | 说明 |
|------|----------|------|
| `mysql_data` | `/var/lib/mysql` | MySQL 数据库数据 |
| `uploads` | `/app/public/uploads` | 用户上传的图片和文件 |

查看卷列表：
```bash
docker volume ls | grep zscx
```

---

## 四、系统更新

### 4.1 常规更新流程

#### 步骤 1：备份数据（更新前必做！）

```bash
# 备份数据库
docker exec zscx-mysql mysqldump -u root -p$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2) zscx > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份上传文件（可选）
docker run --rm -v zscx_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

#### 步骤 2：拉取最新代码

```bash
cd zscx
git pull origin main
```

#### 步骤 3：重新构建并启动

```bash
cd docker
docker compose down
docker compose build --no-cache
docker compose up -d
```

#### 步骤 4：验证更新

```bash
# 查看容器状态
docker compose ps

# 查看日志确认无错误
docker compose logs --tail=50
```

---

### 4.2 一键更新脚本

#### Linux / Mac：使用 deploy.sh

```bash
cd docker
chmod +x deploy.sh
./deploy.sh
```

#### Windows：使用 deploy.bat

双击运行 `deploy.bat`，或在命令行中执行：

```cmd
cd docker
deploy.bat
```

> 脚本功能说明：
> 1. 检查 `.env` 配置文件是否存在
> 2. 拉取最新 Git 代码
> 3. 重新构建镜像
> 4. 启动服务
> 5. 等待数据库初始化

---

### 4.3 数据库迁移

系统使用 Prisma 管理数据库架构，每次启动时会自动执行 `prisma db push` 同步表结构。

如需手动执行迁移：

```bash
# 进入 Web 容器
docker exec -it zscx-web sh

# 执行数据库同步
npx prisma db push

# 执行数据种子（初始化默认账号等）
npx prisma db seed

# 退出容器
exit
```

---

## 五、常用操作命令

### 5.1 服务管理

```bash
# 启动所有服务（后台运行）
docker compose up -d

# 停止所有服务
docker compose down

# 重启所有服务
docker compose restart

# 重启单个服务
docker compose restart web
docker compose restart mysql

# 查看服务状态
docker compose ps

# 查看所有容器（包括已停止的）
docker ps -a
```

### 5.2 日志查看

```bash
# 查看所有服务的实时日志
docker compose logs -f

# 查看指定服务的日志
docker compose logs -f web
docker compose logs -f mysql

# 查看最近 100 行日志
docker compose logs --tail=100 web

# 查看最近 1 小时的日志
docker compose logs --since=1h web
```

### 5.3 容器操作

```bash
# 进入 Web 容器
docker exec -it zscx-web sh

# 进入 MySQL 容器
docker exec -it zscx-mysql bash

# 连接 MySQL 数据库
docker exec -it zscx-mysql mysql -u zscx -p zscx

# 查看容器资源使用情况
docker stats

# 清理未使用的镜像和容器（释放磁盘空间）
docker system prune -a
```

---

## 六、数据备份与恢复

### 6.1 数据库备份

#### 方式一：使用 mysqldump（推荐）

```bash
# 完整备份（在 docker 目录下执行）
docker exec zscx-mysql mysqldump -u root -p$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2) --databases zscx --single-transaction --routines --triggers > backup_zscx_$(date +%Y%m%d_%H%M%S).sql

# 如果需要压缩备份
docker exec zscx-mysql mysqldump -u root -p$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2) --databases zscx --single-transaction | gzip > backup_zscx_$(date +%Y%m%d_%H%M%S).sql.gz
```

#### 方式二：定时自动备份

创建 `backup-mysql.sh` 脚本：

```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=30

mkdir -p $BACKUP_DIR

# 备份数据库
docker exec zscx-mysql mysqldump -u root -p你的密码 --databases zscx --single-transaction | gzip > $BACKUP_DIR/zscx_$DATE.sql.gz

# 删除 30 天前的备份
find $BACKUP_DIR -name "zscx_*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "备份完成: $BACKUP_DIR/zscx_$DATE.sql.gz"
```

设置定时任务：
```bash
# 编辑 crontab
crontab -e

# 每天凌晨 2 点执行备份
0 2 * * * /path/to/backup-mysql.sh >> /var/log/zscx-backup.log 2>&1
```

### 6.2 数据库恢复

> **警告：** 恢复操作会覆盖当前数据库，请确保已备份当前数据！

```bash
# 停止 Web 服务（避免恢复期间写入数据）
docker compose stop web

# 恢复数据库
docker exec -i zscx-mysql mysql -u root -p你的密码 zscx < backup_zscx_20240101_120000.sql

# 启动 Web 服务
docker compose start web
```

如果是压缩备份：
```bash
gunzip < backup_zscx_20240101_120000.sql.gz | docker exec -i zscx-mysql mysql -u root -p你的密码 zscx
```

### 6.3 上传文件备份

```bash
# 备份上传文件
docker run --rm -v zscx_uploads:/data -v $(pwd):/backup alpine tar czf /backup/uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .

# 恢复上传文件
docker run --rm -v zscx_uploads:/data -v $(pwd):/backup alpine tar xzf /backup/uploads_20240101_120000.tar.gz -C /data
```

---

## 七、常见问题

### Q1: 启动后访问不了系统？

**排查步骤：**
1. 检查容器是否正常运行
   ```bash
   docker compose ps
   ```
2. 查看容器日志
   ```bash
   docker compose logs web
   ```
3. 检查端口是否被占用
   ```bash
   # Linux
   netstat -tlnp | grep 3000
   
   # Windows
   netstat -ano | findstr 3000
   ```
4. 检查防火墙设置
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 3000/tcp
   
   # CentOS/RHEL
   sudo firewall-cmd --permanent --add-port=3000/tcp
   sudo firewall-cmd --reload
   ```

### Q2: MySQL 容器启动失败？

**常见原因及解决：**

1. **端口被占用**
   - 修改 `.env` 中的 `MYSQL_PORT` 为其他端口

2. **数据卷权限问题**
   ```bash
   # 删除旧的数据卷（注意：会丢失数据！请先备份）
   docker volume rm zscx_mysql_data
   docker compose up -d
   ```

3. **查看详细错误日志**
   ```bash
   docker compose logs mysql
   ```

### Q3: Web 容器启动后又退出？

**排查方法：**
```bash
# 查看 Web 容器日志
docker compose logs web

# 常见问题：
# 1. 数据库连接失败 - 检查 DATABASE_URL 配置
# 2. JWT_SECRET 未设置 - 检查 .env 文件
# 3. 端口被占用 - 修改 WEB_PORT
```

### Q4: 上传图片失败？

**可能原因：**
1. 文件大小超过限制（默认 10MB）
   - 修改 `docker-compose.yml` 中的 `MAX_FILE_SIZE` 配置

2. 上传目录权限问题
   ```bash
   # 检查卷挂载
   docker exec zscx-web ls -la /app/public/uploads
   ```

### Q5: 忘记管理员密码怎么办？

**方法一：重置为默认密码**

```bash
# 进入 Web 容器
docker exec -it zscx-web sh

# 重新执行种子数据（会重置默认账号）
npx prisma db seed

exit
```

**方法二：直接修改数据库**

```bash
docker exec -it zscx-mysql mysql -u zscx -p zscx

# 执行 SQL 更新密码（密码为 admin123 的 bcrypt 哈希）
UPDATE User SET password = '$2b$10$...' WHERE username = 'admin';
```

### Q6: 如何修改系统名称？

编辑 `docker/.env` 文件：
```env
APP_NAME=你想要的系统名称
```
然后重启服务：
```bash
docker compose restart web
```

### Q7: 如何配置 HTTPS？

推荐使用 Nginx 反向代理，示例配置：

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Q8: Docker 镜像拉取慢怎么办？

配置国内镜像加速器：

```bash
# 编辑 Docker daemon 配置
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF

# 重启 Docker
sudo systemctl daemon-reload
sudo systemctl restart docker
```

---

## 技术支持

如遇到问题，请检查：
1. Docker 版本是否满足要求
2. 服务器资源是否充足
3. 容器日志中的错误信息
4. 防火墙和安全组配置

---

*文档版本：v1.0*
*更新日期：2026-07-04*
