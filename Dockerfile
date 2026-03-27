FROM node:22.22-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y dumb-init curl && rm -rf /var/lib/apt/lists/*

# ============ 安装依赖 ============
COPY package*.json ./
COPY crawlerXnode/package*.json ./crawlerXnode/
RUN npm ci && \
    cd crawlerXnode && npm ci --omit=development && \
    npm cache clean --force && \
    cd ..

# ============ 复制源代码 ============
COPY . .

# ============ 复制启动脚本 ============
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# ============ 备份爬虫脚本 ============
RUN cp -r /app/crawlerXnode/crawler /app/.backup && \
    chmod +x /app/docker-entrypoint.sh

# ============ 构建前端 ============
RUN npm run build && \
    rm -rf crawlerXnode/crawler_test crawlerXnode/logs && \
    find node_modules crawlerXnode/node_modules -name "*.md" -delete 2>/dev/null || true && \
    find node_modules crawlerXnode/node_modules -name "*.test.*" -delete 2>/dev/null || true && \
    find node_modules crawlerXnode/node_modules -name "*.spec.*" -delete 2>/dev/null || true && \
    rm -rf node_modules/.cache crawlerXnode/node_modules/.cache

# ============ 创建数据目录 ============
RUN mkdir -p /app/data /app/crawlerXnode/result /app/crawlerXnode/logs

# ============ 环境变量 ============
ENV NODE_ENV=production \
    PORT=3000 \
    DB_TYPE=sqlite  \
    TZ=Asia/Shanghai

EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
