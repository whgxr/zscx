#!/bin/bash
# 房屋征收调查系统 - 一键推送更新
# 用法: ./push.sh "提交说明"

cd "$(dirname "$0")"

echo "========================================"
echo "  房屋征收调查系统 - 一键推送更新"
echo "========================================"
echo

echo "[1/4] 检查变更..."
git status --short
echo

echo "[2/4] 添加所有变更..."
git add -A
echo

echo "[3/4] 提交变更..."
COMMIT_MSG="${1:-update: 更新代码 $(date '+%Y-%m-%d %H:%M:%S')}"
git commit -m "$COMMIT_MSG"
echo

echo "[4/4] 推送到 GitHub..."
git push origin main
echo

if [ $? -eq 0 ]; then
    echo "========================================"
    echo "  ✅ 推送成功！"
    echo "  仓库地址: https://github.com/whgxr/zscx"
    echo "========================================"
else
    echo "========================================"
    echo "  ❌ 推送失败，请检查错误信息"
    echo "========================================"
fi
