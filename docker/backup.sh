#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
BACKUP_DIR="$SCRIPT_DIR/backups"
DATE=$(date +%Y%m%d_%H%M%S)

echo "========================================"
echo "  房屋征收调查系统 - 数据备份脚本"
echo "========================================"
echo ""

if [ ! -f "$ENV_FILE" ]; then
    echo "[错误] 未找到 .env 配置文件"
    echo "请先复制 .env.example 为 .env 并配置"
    exit 1
fi

source "$ENV_FILE"

mkdir -p "$BACKUP_DIR"

echo "[1/3] 备份数据库..."
DB_BACKUP_FILE="$BACKUP_DIR/zscx_db_$DATE.sql.gz"
docker exec zscx-mysql mysqldump \
    -u root \
    -p"$MYSQL_ROOT_PASSWORD" \
    --databases "$MYSQL_DATABASE" \
    --single-transaction \
    --routines \
    --triggers \
    --quick \
    | gzip > "$DB_BACKUP_FILE"
echo "  数据库备份完成: $DB_BACKUP_FILE"

echo ""
echo "[2/3] 备份上传文件..."
UPLOAD_BACKUP_FILE="$BACKUP_DIR/zscx_uploads_$DATE.tar.gz"
docker run --rm \
    -v zscx_uploads:/data \
    -v "$BACKUP_DIR":/backup \
    alpine \
    tar czf "/backup/zscx_uploads_$DATE.tar.gz" -C /data .
echo "  上传文件备份完成: $UPLOAD_BACKUP_FILE"

echo ""
echo "[3/3] 清理 30 天前的备份..."
find "$BACKUP_DIR" -name "zscx_db_*.sql.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "zscx_uploads_*.tar.gz" -mtime +30 -delete
echo "  清理完成"

echo ""
echo "========================================"
echo "  备份完成！"
echo "========================================"
echo ""
echo "备份文件位置: $BACKUP_DIR"
echo "  - 数据库: zscx_db_$DATE.sql.gz"
echo "  - 上传文件: zscx_uploads_$DATE.tar.gz"
echo ""
echo "备份文件大小:"
du -sh "$DB_BACKUP_FILE" 2>/dev/null || echo "  N/A"
du -sh "$UPLOAD_BACKUP_FILE" 2>/dev/null || echo "  N/A"
echo ""
