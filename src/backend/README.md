# Fantasy GM Assistant Backend

[![Build Status](https://github.com/fantasy-gm-assistant/backend/workflows/CI/badge.svg)](https://github.com/fantasy-gm-assistant/backend/actions)
[![Test Coverage](https://codecov.io/gh/fantasy-gm-assistant/backend/branch/main/graph/badge.svg)](https://codecov.io/gh/fantasy-gm-assistant/backend)
[![Dependency Status](https://deps.rs/repo/github/fantasy-gm-assistant/backend/status.svg)](https://deps.rs/repo/github/fantasy-gm-assistant/backend)
[![Code Quality](https://app.codacy.com/project/badge/Grade/123456)](https://www.codacy.com/gh/fantasy-gm-assistant/backend)

Comprehensive backend service for the Fantasy GM Assistant platform, providing AI-powered analytics, real-time data processing, and secure API endpoints for fantasy sports management.

## Features

- 🚀 FastAPI-based REST API with OpenAPI documentation
- 🔄 Real-time data processing with WebSocket support
- 🧠 AI-powered analytics using GPT-4 integration
- 📊 Asynchronous task processing with Redis Queue
- 💾 Distributed caching with Redis
- 🧪 Automated testing with PyTest
- 🔄 CI/CD pipeline integration
- ☁️ AWS deployment configuration
- 🔒 Security implementation with JWT and OAuth2
- ⚡ Rate limiting and quota management

## Prerequisites

Before you begin, ensure you have the following installed:

- Python 3.11+ (required for async features)
- Poetry 1.5+ (dependency management)
- Docker 24.0+ and Docker Compose
- AWS CLI 2.0+ (for deployment)
- Node.js 18+ (for documentation)
- Make (optional, for convenience scripts)

## Getting Started

### Installation

1. Clone the repository:
```bash
git clone https://github.com/fantasy-gm-assistant/backend.git
cd backend
```

2. Copy environment configuration:
```bash
cp .env.example .env
```

3. Install dependencies:
```bash
poetry install
```

4. Initialize development database:
```bash
poetry run python scripts/init_db.py
```

5. Start services:
```bash
docker-compose up -d
```

### Development Setup

1. Install development dependencies:
```bash
poetry install --with dev
```

2. Set up pre-commit hooks:
```bash
poetry run pre-commit install
```

3. Start development server:
```bash
poetry run start-dev
```

4. Run tests:
```bash
poetry run test
```

### Environment Configuration

Key environment variables (see `.env.example` for full list):

```plaintext
# API Configuration
API_VERSION=v1
DEBUG=true
ENVIRONMENT=development
PORT=8000

# Security
SECRET_KEY=your-secret-key
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fantasy_gm
REDIS_URL=redis://localhost:6379/0

# External Services
OPENAI_API_KEY=your-openai-key
AWS_ACCESS_KEY_ID=your-aws-key
AWS_SECRET_ACCESS_KEY=your-aws-secret
```

### Docker Development

Run the full stack with Docker Compose:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Project Structure

```plaintext
backend/
├── app/
│   ├── api/            # API endpoints
│   ├── core/           # Core functionality
│   ├── models/         # Data models
│   ├── services/       # Business logic
│   └── utils/          # Utility functions
├── tests/              # Test suite
├── scripts/            # Utility scripts
├── docs/               # Documentation
├── docker/             # Docker configurations
└── deployment/         # Deployment configs
```

## Testing

Run different test suites:

```bash
# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=app

# Run specific test category
poetry run pytest tests/api/
```

## API Documentation

- OpenAPI documentation: `http://localhost:8000/docs`
- ReDoc alternative: `http://localhost:8000/redoc`

## Deployment

### AWS Deployment

1. Configure AWS credentials:
```bash
aws configure
```

2. Deploy using Terraform:
```bash
cd deployment/terraform
terraform init
terraform plan
terraform apply
```

### Docker Production Deployment

Build and run production container:

```bash
docker build -t fantasy-gm-backend:latest .
docker run -p 8000:8000 fantasy-gm-backend:latest
```

## Troubleshooting

### Common Issues

1. Database Connection Issues
```bash
# Check database status
docker-compose ps
# Reset database
docker-compose down -v && docker-compose up -d
```

2. Redis Connection Issues
```bash
# Check Redis status
redis-cli ping
# Clear Redis cache
redis-cli FLUSHALL
```

3. Poetry Environment Issues
```bash
# Recreate virtual environment
poetry env remove python
poetry install
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to the branch
5. Create a Pull Request

## License

Proprietary - All rights reserved

## Version

2.0.0 (Last updated: 2024-01-20)

## Maintainers

Fantasy GM Assistant Backend Team

## Support

For support, please open an issue in the GitHub repository or contact the development team.