#!/bin/bash
# 紧急修复脚本：修复 zscx-web 容器不断重启的问题
# 使用方法: cd /path/to/zscx/docker && bash fix-restart.sh

set -e

echo "============================================"
echo "  修复 zscx-web 容器重启问题"
echo "============================================"
echo

cd "$(dirname "$0")"

# 检测 docker compose 命令
if docker compose version &>/dev/null; then
    DC="docker compose"
elif command -v docker-compose &>/dev/null; then
    DC="docker-compose"
else
    echo "❌ 未找到 docker compose 命令！"
    echo
    echo "尝试安装 docker compose 插件:"
    echo "  sudo apt-get update && sudo apt-get install docker-compose-plugin"
    echo "  或"
    echo "  sudo curl -L 'https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)' -o /usr/local/bin/docker-compose"
    echo "  sudo chmod +x /usr/local/bin/docker-compose"
    echo
    echo "如果无法安装，可以用纯 docker 命令手动修复，见脚本底部说明。"
    exit 1
fi

echo "✅ 使用: $DC"

# 步骤1: 拉取最新代码
echo
echo "[1/5] 拉取最新代码..."
cd ..
git pull origin main || echo "⚠️ Git pull 失败，使用当前代码"
cd docker

# 步骤2: 停止当前容器
echo
echo "[2/5] 停止当前容器..."
$DC down || true

# 步骤3: 重新构建镜像
echo
echo "[3/5] 重新构建镜像（可能需要几分钟）..."
$DC build --no-cache web

# 步骤4: 启动容器
echo
echo "[4/5] 启动容器..."
$DC up -d

# 步骤5: 检查状态
echo
echo "[5/5] 检查容器状态..."
sleep 5
$DC ps

echo
echo "============================================"
echo "  ✅ 修复完成！"
echo "============================================"
echo
echo "访问地址: http://localhost:${WEB_PORT:-3000}"
echo "默认账号: admin / admin123"
echo
echo "查看日志: $DC logs -f web"
echo
echo "如果容器仍在重启，查看日志排查:"
echo "  $DC logs web"
