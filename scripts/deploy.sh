#!/bin/bash

# MyAI Suite 部署脚本
# 用于自动化部署 MyAI 套件

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# 检查依赖
check_dependencies() {
    log_info "检查系统依赖..."
    
    # 检查 Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi
    
    # 检查 Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
    
    # 检查 Node.js (用于本地开发)
    if ! command -v node &> /dev/null; then
        log_warning "Node.js 未安装，仅支持 Docker 部署"
    fi
    
    log_success "依赖检查完成"
}

# 环境配置
setup_environment() {
    log_info "配置环境变量..."
    
    # 检查 .env 文件
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            log_info "复制 .env.example 到 .env"
            cp .env.example .env
            log_warning "请编辑 .env 文件配置必要的环境变量"
        else
            log_error ".env.example 文件不存在"
            exit 1
        fi
    fi
    
    # 检查服务器环境变量
    if [ ! -f "server/.env" ]; then
        if [ -f "server/.env.example" ]; then
            log_info "复制 server/.env.example 到 server/.env"
            cp server/.env.example server/.env
        fi
    fi
    
    # 检查 RAG 服务环境变量
    if [ ! -f "rag-service/.env" ]; then
        if [ -f "rag-service/.env.example" ]; then
            log_info "复制 rag-service/.env.example 到 rag-service/.env"
            cp rag-service/.env.example rag-service/.env
        fi
    fi
    
    log_success "环境配置完成"
}

# 创建必要目录
create_directories() {
    log_info "创建必要目录..."
    
    mkdir -p logs
    mkdir -p uploads
    mkdir -p rag-data
    mkdir -p nginx/ssl
    
    log_success "目录创建完成"
}

# Docker 部署
deploy_docker() {
    log_info "开始 Docker 部署..."
    
    # 停止现有容器
    log_info "停止现有容器..."
    docker-compose down
    
    # 构建镜像
    log_info "构建 Docker 镜像..."
    docker-compose build --no-cache
    
    # 启动服务
    log_info "启动服务..."
    docker-compose up -d
    
    # 等待服务启动
    log_info "等待服务启动..."
    sleep 30
    
    # 检查服务状态
    log_info "检查服务状态..."
    docker-compose ps
    
    log_success "Docker 部署完成"
}

# 本地开发部署
deploy_local() {
    log_info "开始本地开发部署..."
    
    # 启动基础服务 (MongoDB, Redis, Qdrant)
    log_info "启动基础服务..."
    docker-compose up -d mongodb redis qdrant minio
    
    # 等待基础服务启动
    sleep 10
    
    # 安装依赖
    log_info "安装服务器依赖..."
    cd server && npm install && cd ..
    
    log_info "安装 RAG 服务依赖..."
    cd rag-service && npm install && cd ..
    
    if [ -d "client" ]; then
        log_info "安装前端依赖..."
        cd client && npm install && cd ..
    fi
    
    log_success "本地开发环境部署完成"
    log_info "请手动启动各个服务："
    log_info "  - 服务器: cd server && npm start"
    log_info "  - RAG服务: cd rag-service && npm start"
    log_info "  - 前端: cd client && npm start"
}

# 健康检查
health_check() {
    log_info "执行健康检查..."
    
    # 检查服务器
    if curl -f http://localhost:3001/health > /dev/null 2>&1; then
        log_success "服务器健康检查通过"
    else
        log_warning "服务器健康检查失败"
    fi
    
    # 检查 RAG 服务
    if curl -f http://localhost:3002/health > /dev/null 2>&1; then
        log_success "RAG 服务健康检查通过"
    else
        log_warning "RAG 服务健康检查失败"
    fi
    
    # 检查前端
    if curl -f http://localhost:3000 > /dev/null 2>&1; then
        log_success "前端服务健康检查通过"
    else
        log_warning "前端服务健康检查失败"
    fi
}

# 显示帮助信息
show_help() {
    echo "MyAI Suite 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -d, --docker   Docker 部署模式"
    echo "  -l, --local    本地开发模式"
    echo "  -c, --check    仅执行健康检查"
    echo "  -s, --stop     停止所有服务"
    echo ""
    echo "示例:"
    echo "  $0 --docker    # Docker 完整部署"
    echo "  $0 --local     # 本地开发部署"
    echo "  $0 --check     # 健康检查"
    echo "  $0 --stop      # 停止服务"
}

# 停止服务
stop_services() {
    log_info "停止所有服务..."
    docker-compose down
    log_success "服务已停止"
}

# 主函数
main() {
    case "$1" in
        -h|--help)
            show_help
            exit 0
            ;;
        -d|--docker)
            check_dependencies
            setup_environment
            create_directories
            deploy_docker
            health_check
            ;;
        -l|--local)
            check_dependencies
            setup_environment
            create_directories
            deploy_local
            ;;
        -c|--check)
            health_check
            ;;
        -s|--stop)
            stop_services
            ;;
        "")
            log_info "请选择部署模式："
            echo "1) Docker 部署"
            echo "2) 本地开发"
            echo "3) 健康检查"
            echo "4) 停止服务"
            read -p "请输入选择 (1-4): " choice
            
            case $choice in
                1)
                    check_dependencies
                    setup_environment
                    create_directories
                    deploy_docker
                    health_check
                    ;;
                2)
                    check_dependencies
                    setup_environment
                    create_directories
                    deploy_local
                    ;;
                3)
                    health_check
                    ;;
                4)
                    stop_services
                    ;;
                *)
                    log_error "无效选择"
                    exit 1
                    ;;
            esac
            ;;
        *)
            log_error "未知选项: $1"
            show_help
            exit 1
            ;;
    esac
    
    log_success "部署完成！"
    log_info "访问地址："
    log_info "  - 前端: http://localhost:3000"
    log_info "  - API: http://localhost:3001"
    log_info "  - RAG服务: http://localhost:3002"
    log_info "  - API文档: http://localhost:3001/api-docs"
    log_info "  - 健康检查: http://localhost:3001/health"
}

# 执行主函数
main "$@"