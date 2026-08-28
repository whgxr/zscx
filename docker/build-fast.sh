#!/bin/bash
# ============================================================
# 快速增量构建脚本：跳过 npm install，仅重新构建 Next.js（约 2-4 分钟）
# 用法（在服务器上 docker/ 目录执行）：bash build-fast.sh
# 前置条件：镜像 zscx-web:local 已存在（首次部署请先完整构建：
#           docker compose up -d --build web）
# ============================================================

set -e

cd "$(dirname "$0")"          # 进入 docker/ 目录
cd ../web                     # 进入源码目录

# 检查基础镜像是否存在
if ! docker image inspect zscx-web:local >/dev/null 2>&1; then
  echo "❌ 未找到 zscx-web:local 镜像，请先执行完整构建：docker compose up -d --build web"
  exit 1
fi

echo "🚀 增量快速构建（跳过 npm install）..."

# 增量构建：复用镜像内 node_modules / .next 缓存
docker build -f Dockerfile.incremental -t zscx-web:new .

# 替换本地镜像标签
docker tag zscx-web:new zscx-web:local

cd ../docker

# 重建并重启 web 容器（使用刚更新的镜像）
docker compose up -d --force-recreate web

echo "✅ 构建完成，web 服务已重启"
sleep 3
curl -s -o /dev/null -w "Web Status: %{http_code}\n" http://localhost:${WEB_PORT:-777}/
