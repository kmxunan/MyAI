# MyAI Server Dockerfile
# 多阶段构建，优化镜像大小

# 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖（仅生产依赖）
RUN npm ci --only=production && npm cache clean --force

# 生产阶段
FROM node:18-alpine AS production

# 安装必要的系统包
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# 创建应用用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S myai -u 1001

# 设置工作目录
WORKDIR /app

# 从构建阶段复制依赖
COPY --from=builder --chown=myai:nodejs /app/node_modules ./node_modules

# 复制应用代码
COPY --chown=myai:nodejs . .

# 创建必要目录
RUN mkdir -p logs uploads && \
    chown -R myai:nodejs logs uploads

# 切换到应用用户
USER myai

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# 启动应用
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]