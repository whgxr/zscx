#!/bin/bash

set -e

echo "🚀 开始部署房屋征收调查系统..."

cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "📝 创建环境配置文件..."
    cp .env.example .env
    echo "⚠️  请先修改 .env 文件中的配置，特别是密码设置"
    echo "   然后重新运行此脚本"
    exit 1
fi

echo "📦 拉取最新代码..."
cd ..
git pull || echo "⚠️  Git pull 失败，使用当前代码"
cd docker

echo "🔨 构建并启动服务..."
docker-compose up -d --build

echo "⏳ 等待数据库初始化..."
sleep 10

echo "✅ 部署完成！"
echo ""
echo "🌐 访问地址: http://localhost:${WEB_PORT:-3000}"
echo "👤 默认管理员: admin / admin123"
echo ""
echo "📋 常用命令:"
echo "   查看日志: docker-compose logs -f"
echo "   停止服务: docker-compose down"
echo "   重启服务: docker-compose restart"
