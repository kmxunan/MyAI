# RAG Service

**Retrieval-Augmented Generation Service for MyAI Platform**

A comprehensive RAG (Retrieval-Augmented Generation) service that provides intelligent document processing, semantic search, and AI-powered chat capabilities for the MyAI platform.

## 🚀 Features

### Core Capabilities
- **Document Processing**: Support for PDF, DOCX, XLSX, TXT, HTML, JSON, CSV, and Markdown files
- **Vector Storage**: Integration with Qdrant vector database for efficient similarity search
- **Semantic Search**: Advanced search capabilities with embedding-based retrieval
- **AI Chat**: RAG-powered conversational AI with context-aware responses
- **Knowledge Base Management**: Organize documents into searchable knowledge bases
- **Multi-Model Support**: Compatible with OpenAI and OpenRouter APIs

### Technical Features
- **Scalable Architecture**: Built with Express.js and MongoDB
- **Caching**: Redis-based caching for improved performance
- **Security**: JWT authentication, rate limiting, input sanitization
- **API Documentation**: Comprehensive Swagger/OpenAPI documentation
- **Monitoring**: Health checks, logging, and performance metrics
- **File Upload**: Secure file handling with validation and processing

## 📋 Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **MongoDB** >= 5.0
- **Redis** >= 6.0
- **Qdrant** >= 1.7.0

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone https://github.com/myai/rag-service.git
cd rag-service
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
```bash
# Copy the example environment file
cp .env.example .env

# Edit the .env file with your configuration
nano .env
```

### 4. Required Environment Variables

Update the following essential variables in your `.env` file:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/myai_rag
REDIS_URL=redis://localhost:6379

# Vector Database
QDRANT_URL=http://localhost:6333

# AI Services
OPENAI_API_KEY=your_openai_api_key_here
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Security
JWT_SECRET=your_super_secret_jwt_key_here
API_KEY_SECRET=your_api_key_secret_here
```

## 🚀 Quick Start

### Development Mode
```bash
# Start the development server with auto-reload
npm run dev
```

### Production Mode
```bash
# Start the production server
npm start
```

### Using PM2 (Recommended for Production)
```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run pm2:start

# Monitor logs
npm run pm2:logs

# Restart service
npm run pm2:restart
```

## 📚 API Documentation

Once the service is running, you can access:

- **API Documentation**: http://localhost:3002/api-docs
- **Health Check**: http://localhost:3002/health
- **API Info**: http://localhost:3002/api/v1/info

## 🔧 API Endpoints

### Health & Status
- `GET /health` - Service health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /api/v1/info` - Service information

### Knowledge Bases
- `GET /api/v1/knowledge-bases` - List knowledge bases
- `POST /api/v1/knowledge-bases` - Create knowledge base
- `GET /api/v1/knowledge-bases/:id` - Get knowledge base
- `PUT /api/v1/knowledge-bases/:id` - Update knowledge base
- `DELETE /api/v1/knowledge-bases/:id` - Delete knowledge base

### Documents
- `POST /api/v1/documents/upload` - Upload documents
- `GET /api/v1/documents` - List documents
- `GET /api/v1/documents/:id` - Get document
- `DELETE /api/v1/documents/:id` - Delete document
- `POST /api/v1/documents/:id/reprocess` - Reprocess document

### Search
- `POST /api/v1/search/semantic` - Semantic search
- `POST /api/v1/search/keyword` - Keyword search
- `POST /api/v1/search/hybrid` - Hybrid search
- `POST /api/v1/search/similar` - Find similar documents

### Chat
- `POST /api/v1/chat` - Chat with knowledge base
- `POST /api/v1/chat/stream` - Streaming chat
- `GET /api/v1/chat/sessions` - Get chat sessions
- `GET /api/v1/chat/sessions/:id` - Get specific session
- `DELETE /api/v1/chat/sessions/:id` - Delete session

## 🔐 Authentication

The service supports multiple authentication methods:

### JWT Bearer Token
```bash
curl -H "Authorization: Bearer <your_jwt_token>" \
     http://localhost:3002/api/v1/knowledge-bases
```

### API Key
```bash
curl -H "X-API-Key: <your_api_key>" \
     http://localhost:3002/api/v1/knowledge-bases
```

## 📁 Project Structure

```
rag-service/
├── app.js                 # Main application entry point
├── package.json           # Dependencies and scripts
├── .env.example          # Environment variables template
├── README.md             # This file
├── config/               # Configuration files
│   ├── database.js       # MongoDB connection
│   └── redis.js          # Redis connection
├── middleware/           # Express middleware
│   ├── auth.js           # Authentication middleware
│   ├── validation.js     # Input validation
│   ├── upload.js         # File upload handling
│   └── errorHandler.js   # Error handling
├── models/               # Database models
│   ├── KnowledgeBase.js  # Knowledge base schema
│   ├── Document.js       # Document schema
│   └── ChatSession.js    # Chat session schema
├── routes/               # API routes
│   ├── health.js         # Health check routes
│   ├── knowledgeBase.js  # Knowledge base routes
│   ├── document.js       # Document routes
│   ├── search.js         # Search routes
│   └── chat.js           # Chat routes
├── services/             # Business logic services
│   ├── vectorDB.js       # Vector database service
│   ├── embedding.js      # Embedding generation
│   ├── documentProcessor.js # Document processing
│   ├── searchService.js  # Search functionality
│   └── chatService.js    # Chat functionality
├── utils/                # Utility functions
│   ├── logger.js         # Logging configuration
│   ├── helpers.js        # Helper functions
│   └── constants.js      # Application constants
├── tests/                # Test files
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── setup.js          # Test setup
├── logs/                 # Log files (auto-created)
├── uploads/              # Uploaded files (auto-created)
└── temp/                 # Temporary files (auto-created)
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Unit Tests
```bash
npm run test:unit
```

### Run Integration Tests
```bash
npm run test:integration
```

### Watch Mode
```bash
npm run test:watch
```

## 🔍 Code Quality

### Linting
```bash
# Check for linting errors
npm run lint

# Fix linting errors automatically
npm run lint:fix
```

### Code Formatting
```bash
# Check code formatting
npm run format:check

# Format code automatically
npm run format
```

### Security Audit
```bash
# Check for security vulnerabilities
npm run security:audit

# Fix security issues
npm run security:fix
```

## 📊 Monitoring & Health Checks

### Health Endpoints
- **Basic Health**: `GET /health`
- **Liveness Probe**: `GET /health/live`
- **Readiness Probe**: `GET /health/ready`
- **Detailed Status**: `GET /health/status`

### Logging
Logs are written to:
- Console (development)
- `./logs/app.log` (application logs)
- `./logs/error.log` (error logs)

### Performance Monitoring
- Request duration tracking
- Slow request detection
- Memory usage monitoring
- Database connection health

## 🐳 Docker Support

### Build Docker Image
```bash
npm run docker:build
```

### Run with Docker
```bash
npm run docker:run
```

### Docker Compose (Recommended)
```yaml
version: '3.8'
services:
  rag-service:
    build: .
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    depends_on:
      - mongodb
      - redis
      - qdrant

  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  mongodb_data:
  qdrant_data:
```

## 🚀 Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Configure production database URLs
3. Set secure JWT secrets
4. Configure CORS origins
5. Set up SSL/TLS certificates

### PM2 Deployment
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup startup script
pm2 startup
```

### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 🔧 Configuration

### Key Configuration Options

#### Database Settings
- `MONGODB_URI`: MongoDB connection string
- `REDIS_URL`: Redis connection string
- `QDRANT_URL`: Qdrant vector database URL

#### AI Model Settings
- `OPENAI_API_KEY`: OpenAI API key
- `OPENROUTER_API_KEY`: OpenRouter API key
- `DEFAULT_EMBEDDING_MODEL`: Default embedding model
- `DEFAULT_CHAT_MODEL`: Default chat model

#### Performance Settings
- `RATE_LIMIT_MAX`: Maximum requests per window
- `UPLOAD_MAX_FILE_SIZE`: Maximum file upload size
- `DEFAULT_CHUNK_SIZE`: Text chunking size
- `CACHE_TTL_DEFAULT`: Default cache TTL

## 🐛 Troubleshooting

### Common Issues

#### Service Won't Start
1. Check environment variables
2. Verify database connections
3. Check port availability
4. Review logs for errors

#### Upload Failures
1. Check file size limits
2. Verify file type restrictions
3. Ensure temp directory exists
4. Check disk space

#### Search Not Working
1. Verify Qdrant connection
2. Check embedding service
3. Ensure documents are processed
4. Review vector collection status

#### Chat Responses Empty
1. Check AI API keys
2. Verify model availability
3. Ensure knowledge base has content
4. Review search results

### Debug Mode
```bash
# Enable debug logging
DEBUG_MODE=true npm run dev

# Verbose logging
VERBOSE_LOGGING=true npm run dev
```

## 📈 Performance Optimization

### Caching Strategy
- Embedding results cached in Redis
- Search results cached with TTL
- Knowledge base metadata cached
- Session data cached

### Database Optimization
- Proper indexing on frequently queried fields
- Connection pooling
- Query optimization
- Regular maintenance

### Vector Database Optimization
- Appropriate collection configuration
- Optimal vector dimensions
- Efficient search parameters
- Regular index optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Development Guidelines
- Follow ESLint configuration
- Write comprehensive tests
- Update documentation
- Use conventional commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- **Email**: support@myai.com
- **Documentation**: [API Docs](http://localhost:3002/api-docs)
- **Issues**: [GitHub Issues](https://github.com/myai/rag-service/issues)

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

**Built with ❤️ by the MyAI Team**