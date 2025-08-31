# MyAI Suite

一个基于OpenRouter API的AI聊天、RAG检索、业务管理一体化平台

## 🌟 项目特色

- **统一AI接入**：完全基于OpenRouter API，支持多种AI模型（GPT、Claude、Gemini等）
- **智能聊天**：现代化的AI对话界面，支持流式响应和上下文记忆
- **RAG检索**：文档上传、向量化存储、智能检索增强生成
- **业务管理**：客户管理、项目跟踪、合同管理、财务记录
- **微服务架构**：前后端分离，模块化设计，易于扩展

## 🏗️ 系统架构

```
┌─────────────────┐    ┌─────────────────┐
│   React 前端    │    │   业务管理界面   │
└─────────────────┘    └─────────────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌─────────────┐
              │ Nginx 网关  │
              └─────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ 聊天服务API │ │ RAG服务API  │ │ 业务管理API │
  └─────────────┘ └─────────────┘ └─────────────┘
         │           │           │
         └───────────┼───────────┘
                     │
              ┌─────────────┐
              │  OpenRouter │
              │     API     │
              └─────────────┘
```

## 📦 项目结构

```
myai-suite/
├── client/              # React 前端应用
│   ├── src/
│   │   ├── components/  # 可复用组件
│   │   ├── pages/       # 页面组件
│   │   ├── services/    # API 服务
│   │   ├── store/       # 状态管理
│   │   └── utils/       # 工具函数
│   └── package.json
├── server/              # 主服务API
│   ├── routes/          # 路由定义
│   ├── models/          # 数据模型
│   ├── services/        # 业务逻辑
│   ├── middleware/      # 中间件
│   └── package.json
├── rag-service/         # RAG检索服务
│   ├── routes/          # RAG相关路由
│   ├── services/        # 文档处理、向量化
│   ├── models/          # 知识库模型
│   └── package.json
├── scripts/             # 部署和启动脚本
├── docker/              # Docker配置
└── docs/                # 项目文档
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- MongoDB 5.0+
- Redis 6.0+
- Qdrant (向量数据库)

### 1. 克隆项目

```bash
git clone https://github.com/kmxunan/MyAI.git
cd MyAI-new
```

### 2. 安装依赖

```bash
npm run install:all
```

### 3. 配置环境变量

#### 主服务配置 (server/.env)
```bash
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/myai
REDIS_URL=redis://localhost:6379

# OpenRouter API配置
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_HTTP_REFERER=http://localhost:3000

# JWT配置
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=7d

# 服务端口
PORT=3001
```

#### RAG服务配置 (rag-service/.env)
```bash
# 数据库配置
MONGODB_URI=mongodb://localhost:27017/myai_rag
REDIS_URL=redis://localhost:6379

# OpenRouter API配置
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_HTTP_REFERER=http://localhost:3000

# Qdrant配置
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=

# 服务端口
PORT=3002
```

#### 前端配置 (client/.env)
```bash
REACT_APP_API_URL=http://localhost:3001
REACT_APP_RAG_API_URL=http://localhost:3002
```

### 4. 启动服务

#### 开发环境
```bash
# 启动所有服务
npm run dev

# 或分别启动
npm run dev:client   # 前端 (端口 3000)
npm run dev:server   # 主服务 (端口 3001)
npm run dev:rag      # RAG服务 (端口 3002)
```

#### 生产环境
```bash
# 构建项目
npm run build

# 启动服务
npm start
```

### 5. 访问应用

- 前端界面: http://localhost:3000
- 主服务API: http://localhost:3001
- RAG服务API: http://localhost:3002

## 🔧 核心功能

### AI聊天
- 支持多种AI模型（通过OpenRouter）
- 流式响应，实时对话
- 上下文记忆和会话管理
- 自定义系统提示词

### RAG检索
- 文档上传和解析（PDF、Word、TXT等）
- 向量化存储和语义检索
- 知识库管理
- 检索增强生成

### 业务管理
- 客户信息管理
- 项目进度跟踪
- 合同和财务记录
- 数据统计和报表

## 🔑 API密钥配置

本项目完全基于OpenRouter API，您需要：

1. 访问 [OpenRouter](https://openrouter.ai/) 注册账号
2. 获取API密钥
3. 在各服务的`.env`文件中配置`OPENROUTER_API_KEY`

## 📚 API文档

- 主服务API: http://localhost:3001/api-docs
- RAG服务API: http://localhost:3002/api-docs

## 🐳 Docker部署

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d
```

## 🛠️ 开发指南

### 添加新的AI模型

1. 在OpenRouter中选择支持的模型
2. 更新服务配置中的模型列表
3. 前端界面会自动同步可用模型

### 扩展RAG功能

1. 在`rag-service/services/`中添加新的处理器
2. 更新路由配置
3. 前端添加对应的界面组件

### 自定义业务模块

1. 在`server/models/`中定义数据模型
2. 在`server/routes/`中添加API路由
3. 前端创建对应的页面和组件

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🆘 支持

如果您遇到问题或有建议，请：

1. 查看 [Issues](https://github.com/kmxunan/MyAI/issues)
2. 创建新的 Issue
3. 联系开发团队

## 🔄 更新日志

### v1.0.0 (2024-01-01)
- 初始版本发布
- 基础AI聊天功能
- RAG检索系统
- 业务管理模块
- 完全基于OpenRouter API

---

**MyAI Suite** - 让AI为您的业务赋能 🚀