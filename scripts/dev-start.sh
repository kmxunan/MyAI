#!/bin/bash

# MyAI Suite 开发环境启动脚本
# 用于快速启动开发环境

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查端口是否被占用
check_port() {
    local port=$1
    local service=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        log_warning "端口 $port 已被占用 ($service)"
        return 1
    else
        log_info "端口 $port 可用 ($service)"
        return 0
    fi
}

# 等待服务启动
wait_for_service() {
    local url=$1
    local service=$2
    local max_attempts=30
    local attempt=1
    
    log_info "等待 $service 启动..."
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f $url > /dev/null 2>&1; then
            log_success "$service 已启动"
            return 0
        fi
        
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo
    log_error "$service 启动超时"
    return 1
}

# 启动基础服务
start_infrastructure() {
    log_info "启动基础设施服务..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装"
        exit 1
    fi
    
    # 启动基础服务
    docker-compose up -d mongodb redis qdrant minio
    
    # 等待服务启动
    sleep 10
    
    log_success "基础设施服务启动完成"
}

# 启动后端服务
start_backend() {
    log_info "启动后端服务..."
    
    # 检查端口
    if ! check_port 3001 "MyAI Server"; then
        log_error "后端服务端口被占用"
        return 1
    fi
    
    # 进入服务器目录
    cd server
    
    # 检查依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装后端依赖..."
        npm install
    fi
    
    # 启动服务
    log_info "启动后端服务器..."
    npm run dev &
    BACKEND_PID=$!
    
    cd ..
    
    # 等待服务启动
    wait_for_service "http://localhost:3001/health" "后端服务"
    
    log_success "后端服务启动完成 (PID: $BACKEND_PID)"
}

# 启动 RAG 服务
start_rag() {
    log_info "启动 RAG 服务..."
    
    # 检查端口
    if ! check_port 3002 "RAG Service"; then
        log_error "RAG 服务端口被占用"
        return 1
    fi
    
    # 进入 RAG 服务目录
    cd rag-service
    
    # 检查依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装 RAG 服务依赖..."
        npm install
    fi
    
    # 启动服务
    log_info "启动 RAG 服务器..."
    npm run dev &
    RAG_PID=$!
    
    cd ..
    
    # 等待服务启动
    wait_for_service "http://localhost:3002/health" "RAG 服务"
    
    log_success "RAG 服务启动完成 (PID: $RAG_PID)"
}

# 启动前端服务
start_frontend() {
    if [ ! -d "client" ]; then
        log_warning "前端目录不存在，跳过前端启动"
        return 0
    fi
    
    log_info "启动前端服务..."
    
    # 检查端口
    if ! check_port 3000 "Frontend"; then
        log_error "前端服务端口被占用"
        return 1
    fi
    
    # 进入前端目录
    cd client
    
    # 检查依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装前端依赖..."
        npm install
    fi
    
    # 启动服务
    log_info "启动前端开发服务器..."
    npm start &
    FRONTEND_PID=$!
    
    cd ..
    
    # 等待服务启动
    wait_for_service "http://localhost:3000" "前端服务"
    
    log_success "前端服务启动完成 (PID: $FRONTEND_PID)"
}

# 显示服务状态
show_status() {
    echo
    log_success "=== MyAI Suite 开发环境启动完成 ==="
    echo
    log_info "服务地址："
    echo "  🌐 前端应用:     http://localhost:3000"
    echo "  🚀 后端 API:     http://localhost:3001"
    echo "  🔍 RAG 服务:     http://localhost:3002"
    echo "  📚 API 文档:     http://localhost:3001/api-docs"
    echo "  ❤️  健康检查:     http://localhost:3001/health"
    echo
    log_info "基础设施："
    echo "  🗄️  MongoDB:      mongodb://localhost:27017/myai"
    echo "  🔴 Redis:        redis://localhost:6379"
    echo "  🔍 Qdrant:       http://localhost:6333"
    echo "  📦 MinIO:        http://localhost:9001 (admin/admin)"
    echo
    log_info "日志文件："
    echo "  📝 应用日志:     ./logs/"
    echo "  🐛 错误日志:     ./logs/error.log"
    echo
    log_warning "按 Ctrl+C 停止所有服务"
}

# 清理函数
cleanup() {
    echo
    log_info "正在停止服务..."
    
    # 停止 Node.js 进程
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
        log_info "后端服务已停止"
    fi
    
    if [ ! -z "$RAG_PID" ]; then
        kill $RAG_PID 2>/dev/null || true
        log_info "RAG 服务已停止"
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        log_info "前端服务已停止"
    fi
    
    # 停止基础设施服务
    log_info "停止基础设施服务..."
    docker-compose down
    
    log_success "所有服务已停止"
    exit 0
}

# 设置信号处理
trap cleanup SIGINT SIGTERM

# 主函数
main() {
    echo "MyAI Suite 开发环境启动脚本"
    echo "=============================="
    echo
    
    # 检查是否在项目根目录
    if [ ! -f "package.json" ] || [ ! -d "server" ]; then
        log_error "请在 MyAI 项目根目录下运行此脚本"
        exit 1
    fi
    
    # 创建必要目录
    mkdir -p logs uploads rag-data
    
    # 启动服务
    start_infrastructure
    start_backend
    start_rag
    start_frontend
    
    # 显示状态
    show_status
    
    # 保持脚本运行
    while true; do
        sleep 1
    done
}

# 检查参数
case "$1" in
    -h|--help)
        echo "MyAI Suite 开发环境启动脚本"
        echo ""
        echo "用法: $0 [选项]"
        echo ""
        echo "选项:"
        echo "  -h, --help     显示帮助信息"
        echo "  --backend-only 仅启动后端服务"
        echo "  --rag-only     仅启动 RAG 服务"
        echo "  --infra-only   仅启动基础设施"
        echo ""
        exit 0
        ;;
    --backend-only)
        start_infrastructure
        start_backend
        show_status
        while true; do sleep 1; done
        ;;
    --rag-only)
        start_infrastructure
        start_rag
        show_status
        while true; do sleep 1; done
        ;;
    --infra-only)
        start_infrastructure
        show_status
        while true; do sleep 1; done
        ;;
    "")
        main
        ;;
    *)
        log_error "未知选项: $1"
        echo "使用 --help 查看帮助信息"
        exit 1
        ;;
esac