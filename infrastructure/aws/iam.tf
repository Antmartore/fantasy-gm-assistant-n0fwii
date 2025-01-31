# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# ECS Task Execution Role
resource "aws_iam_role" "ecs_execution_role" {
  name                 = "${var.project_name}-ecs-execution-${var.environment}"
  description          = "Allows ECS tasks to call AWS services on behalf of the application"
  max_session_duration = 3600
  path                = "/service-roles/"
  
  # Trust relationship policy for ECS tasks
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount": data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  # Permissions boundary for enhanced security
  permissions_boundary = "arn:aws:iam::aws:policy/service-role/AWSECSTaskExecutionRolePolicyBoundary"

  tags = {
    Environment        = var.environment
    Project           = var.project_name
    ManagedBy         = "Terraform"
    SecurityLevel     = "High"
    ComplianceScope   = "SOC2"
    DataClassification = "Sensitive"
  }
}

# ECS Task Role
resource "aws_iam_role" "ecs_task_role" {
  name                 = "${var.project_name}-ecs-task-${var.environment}"
  description          = "Allows ECS tasks to access AWS services with least privilege"
  max_session_duration = 3600
  path                = "/service-roles/"

  # Trust relationship policy for ECS tasks
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
        Condition = {
          StringEquals = {
            "aws:SourceAccount": data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  # Permissions boundary for enhanced security
  permissions_boundary = "arn:aws:iam::aws:policy/service-role/AWSECSTaskRolePolicyBoundary"

  tags = {
    Environment        = var.environment
    Project           = var.project_name
    ManagedBy         = "Terraform"
    SecurityLevel     = "High"
    ComplianceScope   = "SOC2"
    DataClassification = "Sensitive"
  }
}

# S3 Access Policy for ECS Tasks
resource "aws_iam_role_policy" "s3_access" {
  name = "${var.project_name}-s3-access-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-media-${var.environment}",
          "arn:aws:s3:::${var.project_name}-media-${var.environment}/*"
        ]
        Condition = {
          StringEquals = {
            "aws:RequestTag/Environment": var.environment
          }
        }
      }
    ]
  })
}

# SQS Access Policy for ECS Tasks
resource "aws_iam_role_policy" "sqs_access" {
  name = "${var.project_name}-sqs-access-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = "arn:aws:sqs:*:*:${var.project_name}-*-${var.environment}"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Environment": var.environment
          }
        }
      }
    ]
  })
}

# ElastiCache Redis Access Policy for ECS Tasks
resource "aws_iam_role_policy" "redis_access" {
  name = "${var.project_name}-redis-access-${var.environment}"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticache:Connect",
          "elasticache:Describe*"
        ]
        Resource = "arn:aws:elasticache:*:*:cluster:${var.project_name}-redis-${var.environment}"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Environment": var.environment
          }
        }
      }
    ]
  })
}

# CloudWatch Logs Access Policy for ECS Tasks
resource "aws_iam_role_policy" "cloudwatch_logs_access" {
  name = "${var.project_name}-cloudwatch-logs-${var.environment}"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:log-group:/aws/ecs/${var.project_name}-*-${var.environment}:*"
      }
    ]
  })
}

# ECR Access Policy for ECS Execution Role
resource "aws_iam_role_policy" "ecr_access" {
  name = "${var.project_name}-ecr-access-${var.environment}"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestTag/Environment": var.environment
          }
        }
      }
    ]
  })
}

# Data source for current AWS account ID
data "aws_caller_identity" "current" {}

# Outputs for use in other Terraform configurations
output "ecs_execution_role_arn" {
  description = "ARN of the ECS execution role"
  value       = aws_iam_role.ecs_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}