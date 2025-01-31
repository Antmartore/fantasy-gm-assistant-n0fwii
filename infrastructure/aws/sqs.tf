# AWS Provider configuration with version constraint
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Main simulation queue for Monte Carlo simulations and predictive modeling
resource "aws_sqs_queue" "simulation_queue" {
  name                       = "${var.project_name}-${var.environment}-simulation-queue"
  visibility_timeout_seconds = 900  # 15 minutes for complex calculations
  message_retention_seconds  = 86400  # 24 hours retention
  max_message_size          = 262144  # 256 KB
  delay_seconds             = 0
  receive_wait_time_seconds = 20  # Long polling
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.simulation_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name          = "${var.project_name}-${var.environment}-simulation-queue"
    Environment   = var.environment
    Purpose       = "Monte Carlo simulations"
    CostCenter    = "Analytics"
    SecurityLevel = "High"
  }
}

# Media generation queue for video and audio processing
resource "aws_sqs_queue" "media_queue" {
  name                       = "${var.project_name}-${var.environment}-media-queue"
  visibility_timeout_seconds = 1800  # 30 minutes for media processing
  message_retention_seconds  = 86400  # 24 hours retention
  max_message_size          = 262144  # 256 KB
  delay_seconds             = 0
  receive_wait_time_seconds = 20  # Long polling
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.media_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name          = "${var.project_name}-${var.environment}-media-queue"
    Environment   = var.environment
    Purpose       = "Media generation"
    CostCenter    = "Content"
    SecurityLevel = "Medium"
  }
}

# Analytics queue for data processing tasks
resource "aws_sqs_queue" "analytics_queue" {
  name                       = "${var.project_name}-${var.environment}-analytics-queue"
  visibility_timeout_seconds = 600  # 10 minutes for analytics tasks
  message_retention_seconds  = 86400  # 24 hours retention
  max_message_size          = 262144  # 256 KB
  delay_seconds             = 0
  receive_wait_time_seconds = 20  # Long polling
  
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analytics_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name          = "${var.project_name}-${var.environment}-analytics-queue"
    Environment   = var.environment
    Purpose       = "Data analytics"
    CostCenter    = "Analytics"
    SecurityLevel = "Medium"
  }
}

# Dead Letter Queue for failed simulation tasks
resource "aws_sqs_queue" "simulation_dlq" {
  name                      = "${var.project_name}-${var.environment}-simulation-dlq"
  message_retention_seconds = 1209600  # 14 days retention for investigation

  tags = {
    Name          = "${var.project_name}-${var.environment}-simulation-dlq"
    Environment   = var.environment
    Purpose       = "Failed simulations"
    CostCenter    = "Analytics"
    SecurityLevel = "High"
  }
}

# Dead Letter Queue for failed media generation tasks
resource "aws_sqs_queue" "media_dlq" {
  name                      = "${var.project_name}-${var.environment}-media-dlq"
  message_retention_seconds = 1209600  # 14 days retention for investigation

  tags = {
    Name          = "${var.project_name}-${var.environment}-media-dlq"
    Environment   = var.environment
    Purpose       = "Failed media tasks"
    CostCenter    = "Content"
    SecurityLevel = "Medium"
  }
}

# Dead Letter Queue for failed analytics tasks
resource "aws_sqs_queue" "analytics_dlq" {
  name                      = "${var.project_name}-${var.environment}-analytics-dlq"
  message_retention_seconds = 1209600  # 14 days retention for investigation

  tags = {
    Name          = "${var.project_name}-${var.environment}-analytics-dlq"
    Environment   = var.environment
    Purpose       = "Failed analytics"
    CostCenter    = "Analytics"
    SecurityLevel = "Medium"
  }
}

# Output queue URLs for worker service configuration
output "simulation_queue_url" {
  value       = aws_sqs_queue.simulation_queue.url
  description = "URL of the simulation queue for worker service configuration"
}

output "media_queue_url" {
  value       = aws_sqs_queue.media_queue.url
  description = "URL of the media generation queue for worker service configuration"
}

output "analytics_queue_url" {
  value       = aws_sqs_queue.analytics_queue.url
  description = "URL of the analytics queue for worker service configuration"
}