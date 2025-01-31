# Stage 1: Builder stage
FROM python:3.11-slim AS builder

# Set working directory
WORKDIR /app

# Install system dependencies and security tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install security scanning tools
RUN pip install --no-cache-dir safety bandit

# Copy requirements file
COPY requirements.txt .

# Run security scan on dependencies
RUN safety check -r requirements.txt

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create virtual environment
RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Stage 2: Final stage
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libpq5 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder
COPY --from=builder /app/venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

# Copy application code
COPY . .

# Set file permissions
RUN chmod -R 644 /app \
    && find /app -type d -exec chmod 755 {} \;

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup -s /sbin/nologin -d /app appuser \
    && chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Configure environment
ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1 \
    PYTHON_ENV=production \
    GUNICORN_CMD_ARGS="--workers=4 --worker-class=uvicorn.workers.UvicornWorker" \
    PORT=8000

# Set security headers
ENV SECURE_HEADERS="1" \
    SECURE_SSL_REDIRECT="1" \
    SESSION_COOKIE_SECURE="1" \
    CSRF_COOKIE_SECURE="1"

# Configure resource limits
ENV MEMORY_LIMIT="4g" \
    CPU_LIMIT="2" \
    PIDS_LIMIT="100"

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl --fail http://localhost:8000/health || exit 1

# Start application with Gunicorn
ENTRYPOINT ["gunicorn"]
CMD ["main:app", "--bind", "0.0.0.0:8000"]