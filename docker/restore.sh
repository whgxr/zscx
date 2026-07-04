#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BACKUP_DIR="$SCRIPT_DIR/backups"

echo "========================================"
echo "  房屋征收调查系统 - 数据恢复脚本"
echo "========================================"
echo ""

if [ ! -f "$ENV_FILE" ]; then
    echo "[错误] 未找到 .env 配置文件"
    exit 1
fi

source "$ENV_FILE"

echo "⚠️  警告：此操作将覆盖当前数据库和上传文件！"
echo ""
echo "请选择要恢复的备份类型："
echo "  1) 仅恢复数据库"
echo "  2) 仅恢复上传文件"
echo "  3) 恢复数据库和上传文件"
echo "  0) 取消"
echo ""
read -p "请输入选项 [0-3]: " choice

if [ "$choice" = "0" ] || [ -z "$choice" ]; then
    echo "已取消"
    exit 0
fi

if [ ! -d "$BACKUP_DIR" ]; then
    echo "[错误] 备份目录不存在: $BACKUP_DIR"
    exit 1
fi

echo ""
echo "可用的备份文件："
echo ""

if [[ "$choice" == *"1"* ]] || [[ "$choice" == *"3"* ]]; then
    echo "数据库备份："
    ls -1t "$BACKUP_DIR"/zscx_db_*.sql* 2>/dev/null | head -10 | nl -w2 -s') ' || echo "  （无）"
    echo ""
fi

if [[ "$choice" == *"2"* ]] || [[ "$choice" == *"3"* ]]; then
    echo "上传文件备份："
    ls -1t "$BACKUP_DIR"/zscx_uploads_*.tar.gz 2>/dev/null | head -10 | nl -w2 -s') ' || echo "  （无）"
    echo ""
fi

if [[ "$choice" == *"1"* ]] || [[ "$choice" == *"3"* ]]; then
    read -p "请输入要恢复的数据库备份文件路径: " db_backup
    if [ -z "$db_backup" ] || [ ! -f "$db_backup" ]; then
        echo "[错误] 文件不存在: $db_backup"
        exit 1
    fi
fi

if [[ "$choice" == *"2"* ]] || [[ "$choice" == *"3"* ]]; then
    read -p "请输入要恢复的上传文件备份文件路径: " upload_backup
    if [ -z "$upload_backup" ] || [ ! -f "$upload_backup" ]; then
        echo "[错误] 文件不存在: $upload_backup"
        exit 1
    fi
fi

echo ""
read -p "⚠️  确认要恢复吗？此操作不可撤销！(y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
fi

echo ""

if [[ "$choice" == *"1"* ]] || [[ "$choice" == *"3"* ]]; then
    echo "[1/2] 恢复数据库..."
    echo "  停止 Web 服务..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" stop web 2>/dev/null || true
    
    echo "  恢复数据..."
    if [[ "$db_backup" == *.gz ]]; then
        gunzip < "$db_backup" | docker exec -i zscx-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD"
    else
        docker exec -i zscx-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" < "$db_backup"
    fi
    
    echo "  启动 Web 服务..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" start web 2>/dev/null || true
    echo "  数据库恢复完成"
    echo ""
fi

if [[ "$choice" == *"2"* ]] || [[ "$choice" == *"3"* ]]; then
    echo "[2/2] 恢复上传文件..."
    echo "  停止 Web 服务..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" stop web 2>/dev/null || true
    
    echo "  恢复文件..."
    docker run --rm \
        -v zscx_uploads:/data \
        -v "$upload_backup":/backup.tar.gz \
        alpine \
        sh -c "rm -rf /data/* && tar xzf /backup.tar.gz -C /data"
    
    echo "  启动 Web 服务..."
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" start web 2>/dev/null || true
    echo "  上传文件恢复完成"
    echo ""
fi

echo "========================================"
echo "  恢复完成！"
echo "========================================"
echo ""
