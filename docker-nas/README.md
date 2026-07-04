# NAS 部署指南

本目录包含在 NAS（网络存储服务器）上部署房屋征收调查系统的专用配置。

## 部署方式选择

### 方式一：从 GitHub 拉取源码构建（推荐新手）

适合：NAS 性能较好，希望使用最新代码，不想配置镜像仓库

**步骤：**

1. 将整个项目上传到 NAS，或在 NAS 上直接克隆：
   ```bash
   git clone https://github.com/你的用户名/zscx.git
   cd zscx/docker
   ```

2. 配置环境变量：
   ```bash
   cp .env.example .env
   # 编辑 .env 修改密码等配置
   ```

3. 启动服务：
   ```bash
   docker compose up -d --build
   ```

> 完整说明请参考 `../docker/DEPLOY.md`

---

### 方式二：使用 GHCR 预构建镜像（推荐，NAS 压力小）

适合：希望快速部署，NAS 性能一般，不想在 NAS 上构建

**前置条件：**
- 已将代码推送到 GitHub
- 已配置 GitHub Actions 自动构建镜像（或手动构建推送）

**步骤：**

1. 将本目录（`docker-nas`）的所有文件上传到 NAS 的一个目录中，例如：
   ```
   /docker/zscx/
   ├── docker-compose.yml
   ├── .env.example
   └── README.md
   ```

2. 复制环境变量配置：
   ```bash
   cd /docker/zscx
   cp .env.example .env
   ```

3. 编辑 `.env` 文件，修改以下配置：
   - `GITHUB_USERNAME` - 你的 GitHub 用户名
   - `MYSQL_ROOT_PASSWORD` - MySQL root 密码（务必修改）
   - `MYSQL_PASSWORD` - 应用数据库密码（务必修改）
   - `JWT_SECRET` - JWT 密钥（务必修改为随机字符串）
   - `WEB_PORT` - Web 访问端口（默认 3000）

4. 如果镜像是私有的，需要先登录 GHCR：
   ```bash
   docker login ghcr.io -u 你的GitHub用户名 -p 你的Personal Access Token
   ```

5. 拉取镜像并启动：
   ```bash
   docker compose pull
   docker compose up -d
   ```

6. 查看日志：
   ```bash
   docker compose logs -f
   ```

---

## 镜像构建与推送（GitHub Actions）

在你的 GitHub 仓库中添加以下工作流文件，实现代码推送后自动构建镜像：

创建文件：`.github/workflows/docker-build.yml`

```yaml
name: Docker Build and Push

on:
  push:
    branches: [ main ]
    tags:
      - 'v*'
  workflow_dispatch:

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}-web

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=tag
            type=sha
            latest

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./web
          file: ./web/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

---

## 常用命令

```bash
# 拉取最新镜像
docker compose pull

# 启动服务
docker compose up -d

# 停止服务
docker compose down

# 重启服务
docker compose restart

# 查看日志
docker compose logs -f

# 查看容器状态
docker compose ps
```

---

## 数据备份

```bash
# 创建备份目录
mkdir -p backups

# 备份数据库
docker exec zscx-mysql mysqldump -u root -p你的密码 --databases zscx --single-transaction | gzip > backups/zscx_db_$(date +%Y%m%d_%H%M%S).sql.gz

# 备份上传文件
docker run --rm -v zscx_uploads:/data -v $(pwd)/backups:/backup alpine tar czf /backup/zscx_uploads_$(date +%Y%m%d_%H%M%S).tar.gz -C /data .
```

---

## 更新系统

### 方式一：使用镜像（推荐）
```bash
# 拉取最新镜像
docker compose pull

# 重新创建容器
docker compose up -d

# 查看日志确认
docker compose logs --tail=50
```

### 方式二：从源码构建
```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker compose up -d --build
```

---

## 常见问题

### Q: 镜像拉取失败？
A: 检查网络连接，或配置 Docker 镜像加速器。

### Q: 提示权限不足？
A: 如果镜像是私有的，需要先登录 GHCR：
   ```bash
   docker login ghcr.io -u 用户名 -p Token
   ```

### Q: Web 容器启动失败？
A: 查看日志排查原因：
   ```bash
   docker compose logs web
   ```
   常见原因：数据库连接失败、JWT_SECRET 未设置

### Q: 如何修改端口？
A: 编辑 `.env` 文件，修改 `WEB_PORT` 或 `MYSQL_PORT`，然后重启：
   ```bash
   docker compose restart
   ```
