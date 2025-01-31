# AWS ElastiCache Redis configuration for Fantasy Sports GM Assistant
# Provider version: hashicorp/aws ~> 4.0

# ElastiCache subnet group for Redis cluster deployment
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.project_name}-${var.environment}-redis"
  subnet_ids  = aws_vpc.main.private_subnet_ids
  description = "Subnet group for Redis cluster deployment in private subnets"

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-subnet"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ElastiCache parameter group with performance optimizations
resource "aws_elasticache_parameter_group" "main" {
  family      = "redis7.0"
  name        = "${var.project_name}-${var.environment}-redis"
  description = "Custom parameter group for Redis cluster with performance optimizations"

  # LRU cache settings for optimal memory management
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  # Connection timeout for performance requirements
  parameter {
    name  = "timeout"
    value = "300"
  }

  # LRU samples for better eviction accuracy
  parameter {
    name  = "maxmemory-samples"
    value = "10"
  }

  # Enable active defragmentation
  parameter {
    name  = "activedefrag"
    value = "yes"
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-params"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# ElastiCache replication group for Redis cluster
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${var.project_name}-${var.environment}"
  description         = "Redis cluster for Fantasy GM Assistant with HA and encryption"
  node_type           = var.redis_node_type[var.environment]
  num_cache_clusters  = var.redis_num_cache_nodes[var.environment]
  port               = 6379

  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  # High availability configuration
  automatic_failover_enabled = var.environment != "dev"
  multi_az_enabled          = var.environment != "dev"

  # Engine configuration
  engine         = "redis"
  engine_version = "7.0"

  # Encryption configuration
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  auth_token                 = var.redis_auth_token

  # Maintenance and backup configuration
  maintenance_window      = "sun:05:00-sun:09:00"
  snapshot_window        = "03:00-05:00"
  snapshot_retention_limit = var.environment == "prod" ? 7 : 1
  auto_minor_version_upgrade = true

  # Notification configuration
  notification_topic_arn = var.sns_topic_arn

  tags = {
    Name              = "${var.project_name}-${var.environment}-redis"
    Environment       = var.environment
    ManagedBy         = "Terraform"
    Service           = "Fantasy-GM-Assistant"
    CostCenter        = "Infrastructure"
    DataClassification = "Internal"
  }
}

# Security group for Redis cluster
resource "aws_security_group" "redis" {
  name        = "${var.project_name}-${var.environment}-redis"
  description = "Security group for Redis cluster with restricted access"
  vpc_id      = aws_vpc.main.vpc_id

  # Allow inbound Redis traffic from ECS tasks only
  ingress {
    description     = "Redis access from ECS tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  # Allow all outbound traffic
  egress {
    description = "Allow all outbound traffic"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${var.project_name}-${var.environment}-redis-sg"
    Environment = var.environment
    Service     = "Fantasy-GM-Assistant"
    ManagedBy   = "Terraform"
  }
}

# Outputs for other Terraform configurations
output "redis_endpoint" {
  description = "Primary endpoint for Redis cluster connections"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_port" {
  description = "Port number for Redis cluster access"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_reader_endpoint" {
  description = "Reader endpoint for Redis cluster read operations"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
}