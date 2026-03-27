#!/bin/sh
set -e

echo "🚀 启动容器..."

CRAWLER_DIR="/app/crawlerXnode/crawler"
BACKUP_DIR="/app/.backup"

# 确保目标目录存在
mkdir -p "$CRAWLER_DIR"

# 检查备份目录是否存在
if [ -d "$BACKUP_DIR" ]; then
    # 检查目标目录是否为空
    if [ -z "$(ls -A "$CRAWLER_DIR" 2>/dev/null)" ]; then
        echo "🚀 检测到空目录，从备份复制爬虫脚本..."
        cp -r "$BACKUP_DIR"/* "$CRAWLER_DIR"/ 2>/dev/null || true
        echo "✅ 爬虫脚本初始化完成。"
    else
        echo "ℹ️ 目录已有文件，跳过复制。"
    fi
else
    echo "⚠️ 警告：备份目录不存在。"
fi

echo "🌐 启动服务器..."
exec npx tsx /app/src/server/index.ts
