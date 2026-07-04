# NAS 部署指南

本目录包含在 NAS（网络存储服务器）上部署房屋征收调查系统的专用配置。

## ⚠️ 重要前置步骤

在使用 NAS 部署前，**必须先在 GitHub 上配置自动构建**，否则镜像不存在会拉取失败。

请参考本文档的「镜像自动构建」章节，先创建 GitHub Actions 工作流。

---

## 部署方式选择

### 方式一：完整项目源码构建（最简单，不需要配置镜像）

适合：NAS 性能还可以，想省事儿，不想折腾镜像仓库

**步骤：**

1. 在 NAS 上克隆完整项目：
   ```bash
   git clone https://github.com/whgxr/zscx.git
   cd zscx/docker
   ```

2. 配置环境变量：
   ```bash
   cp .env.example .env
   # 编辑 .env 修改密码等配置
   ```

3. 启动服务（首次会自动构建镜像）：
   ```bash
   docker compose up -d --build
   ```

> 完整说明请参考 `../docker/DEPLOY.md`

---

### 方式二：使用 GHCR 预构建镜像（推荐，NAS 压力小）

适合：希望快速部署，NAS 性能一般，不想在 NAS 上构建

**前置条件：**
- ✅ 已在 GitHub 上配置 Actions 自动构建（见下文）
- ✅ 镜像已构建成功（可在 GitHub 仓库的 Packages 页面查看）

**步骤：**

1. 将本目录（`docker-nas`）的所有文件上传到 NAS 的一个目录中，例如：
   ```
   /docker/zscx/
   ├── docker-compose.yml
   └── .env.example
   ```

2. 复制环境变量配置：
   ```bash
   cd /docker/zscx
   cp .env.example .env
   ```

3. 编辑 `.env` 文件，修改以下配置：
   - `MYSQL_ROOT_PASSWORD` - MySQL root 密码（务必修改）
   - `MYSQL_PASSWORD` - 应用数据库密码（务必修改）
   - `JWT_SECRET` - JWT 密钥（务必修改为随机字符串）
   - `WEB_PORT` - Web 访问端口（默认 3000）

4. 如果镜像包是私有的（默认私有），需要先登录 GHCR：
   ```bash
   # 先去 GitHub 生成一个 Personal Access Token (PAT)
   # 地址：https://github.com/settings/tokens
   # 权限勾选：read:packages
   docker login ghcr.io -u whgxr -p 你的Token
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

7. 访问系统：`http://NAS_IP:3000`
   - 默认管理员：`admin` / `admin123`

---

## 镜像自动构建（GitHub Actions）

### 第一步：创建工作流文件

在 GitHub 网页上操作：

1. 打开你的仓库：https://github.com/whgxr/zscx

2. 点击 **Add file** → **Create new file**

3. 文件名输入：
   ```
   .github/workflows/docker-build.yml
   ```

4. 粘贴以下内容：

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
            type=raw,value=latest,enable={{is_default_branch}}

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

5. 点击页面底部 **Commit new file**

### 第二步：等待构建完成

- 构建会自动触发（因为 push 了 main 分支）
- 查看构建状态：https://github.com/whgxr/zscx/actions
- 构建成功后，镜像会出现在：https://github.com/whgxr/zscx/pkgs/container/zscx-web
- 构建时间约 3-5 分钟

### 第三步（可选）：将镜像包设为公开

GHCR 镜像默认是私有的，如果你不想每次都登录，可以设为公开：

1. 打开：https://github.com/whgxr/zscx/pkgs/container/zscx-web
2. 点击右侧 **Package settings**
3. 滚动到 **Danger Zone**
4. 点击 **Change visibility**
5. 选择 **Public**，输入包名确认

> ⚠️ 设为公开后任何人都可以拉取镜像，请自行权衡安全性。

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

# 查看指定服务日志
docker compose logs -f web
docker compose logs -f mysql

# 查看容器状态
docker compose ps
```

---

## 更新系统

### 使用镜像方式（推荐）

```bash
# 1. 拉取最新镜像
docker compose pull

# 2. 重新创建容器
docker compose up -d

# 3. 查看日志确认
docker compose logs --tail=50
```

### 使用源码构建方式

```bash
# 1. 拉取最新代码
cd zscx
git pull

# 2. 重新构建并启动
cd docker
docker compose up -d --build
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

也可以使用项目自带的备份脚本（在 `docker/` 目录下）：
```bash
cd zscx/docker
./backup.sh   # Linux/Mac
backup.bat    # Windows
```

---

## 常见问题

### Q: 镜像拉取失败，提示 denied？

**原因：** GHCR 镜像包默认是私有的，需要登录才能拉取。

**解决方法：**
1. 生成 GitHub Personal Access Token：https://github.com/settings/tokens
   - 权限勾选 `read:packages`
2. 登录 GHCR：
   ```bash
   docker login ghcr.io -u whgxr -p 你的Token
   ```
3. 或者将镜像包设为公开（见上文「第三步」）

---

### Q: 提示 manifest unknown？

**原因：** 镜像还没有构建成功，或者标签不对。

**解决方法：**
1. 检查 Actions 构建状态：https://github.com/whgxr/zscx/actions
2. 确认构建成功，并且有 `latest` 标签
3. 查看 Packages 页面：https://github.com/whgxr/zscx/pkgs

---

### Q: Web 容器启动失败？

**排查方法：**
```bash
docker compose logs web
```

**常见原因：**
- 数据库还没准备好（容器会自动重启，等一会就好）
- JWT_SECRET 未设置（检查 `.env` 文件）
- 数据库连接失败（检查 `.env` 中的密码配置）

---

### Q: 如何修改端口？

编辑 `.env` 文件，修改 `WEB_PORT` 或 `MYSQL_PORT`，然后重启：
```bash
docker compose restart
```

---

### Q: MySQL 容器启动失败？

**常见原因：**
1. 端口被占用 → 修改 `.env` 中的 `MYSQL_PORT`
2. 旧数据卷有问题 → 删除旧卷（注意：会丢失数据！）：
   ```bash
   docker volume rm zscx_mysql_data
   docker compose up -d
   ```

---

## 技术支持

如遇到问题：
1. 查看容器日志：`docker compose logs -f`
2. 检查容器状态：`docker compose ps`
3. 确认 Actions 构建是否成功

---

*文档版本：v1.1*
*更新日期：2026-07-04*
