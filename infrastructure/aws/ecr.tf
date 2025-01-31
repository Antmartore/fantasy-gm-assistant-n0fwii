# AWS ECR configuration for Fantasy Sports GM Assistant
# Terraform version: ~> 1.0
# AWS Provider version: ~> 4.0

# KMS key for ECR repository encryption
resource "aws_kms_key" "ecr_key" {
  description             = "KMS key for ECR encryption"
  deletion_window_in_days = 7
  enable_key_rotation     = true
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-ecr-${var.environment}"
  })
}

# ECR repository for API service
resource "aws_ecr_repository" "api_service" {
  name                 = "${var.project_name}-api-${var.environment}"
  image_tag_mutability = "MUTABLE"
  
  image_scanning_configuration {
    scan_on_push = true
  }
  
  encryption_configuration {
    encryption_type = "KMS"
    kms_key = aws_kms_key.ecr_key.arn
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-api-${var.environment}"
  })
}

# ECR repository for worker service
resource "aws_ecr_repository" "worker_service" {
  name                 = "${var.project_name}-worker-${var.environment}"
  image_tag_mutability = "MUTABLE"
  
  image_scanning_configuration {
    scan_on_push = true
  }
  
  encryption_configuration {
    encryption_type = "KMS"
    kms_key = aws_kms_key.ecr_key.arn
  }
  
  tags = merge(var.tags, {
    Name = "${var.project_name}-worker-${var.environment}"
  })
}

# Lifecycle policy for API service repository
resource "aws_ecr_lifecycle_policy" "api_service" {
  repository = aws_ecr_repository.api_service.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["prod"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Remove untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Lifecycle policy for worker service repository
resource "aws_ecr_lifecycle_policy" "worker_service" {
  repository = aws_ecr_repository.worker_service.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 5 production images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["prod"]
          countType     = "imageCountMoreThan"
          countNumber   = 5
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Remove untagged images after 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# Output values for use in other Terraform configurations
output "api_repository_url" {
  description = "URL of the API service ECR repository"
  value       = aws_ecr_repository.api_service.repository_url
}

output "worker_repository_url" {
  description = "URL of the worker service ECR repository"
  value       = aws_ecr_repository.worker_service.repository_url
}

output "ecr_kms_key_arn" {
  description = "ARN of the KMS key used for ECR encryption"
  value       = aws_kms_key.ecr_key.arn
}