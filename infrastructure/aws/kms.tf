# AWS KMS configuration for Fantasy Sports GM Assistant
# Provider version: ~> 4.0
# Terraform version: ~> 1.0

# Primary KMS key for application data encryption
resource "aws_kms_key" "main" {
  description              = "KMS key for Fantasy GM Assistant application data encryption with automatic rotation"
  deletion_window_in_days  = 30
  enable_key_rotation     = true
  is_enabled              = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage               = "ENCRYPT_DECRYPT"
  multi_region            = false

  # Dynamic key policy based on environment
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${data.aws_region.current.name}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow ECS Service"
        Effect = "Allow"
        Principal = {
          Service = "ecs.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name             = "${var.project_name}-${var.environment}-kms-key"
    Environment      = var.environment
    Project          = var.project_name
    ManagedBy        = "terraform"
    SecurityLevel    = "high"
    Purpose          = "Application data encryption"
    ComplianceScope  = "PII-GDPR-CCPA"
    RotationEnabled  = "true"
    BackupEnabled    = "true"
  }
}

# User-friendly alias for the KMS key
resource "aws_kms_alias" "main" {
  name          = "alias/${var.project_name}-${var.environment}-key"
  target_key_id = aws_kms_key.main.key_id
}

# Data sources for dynamic policy configuration
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Output the KMS key ID for reference by other resources
output "kms_key_id" {
  description = "KMS key ID for encryption operations and IAM policies"
  value       = aws_kms_key.main.key_id
}

# Output the KMS key ARN for cross-account access and IAM policies
output "kms_key_arn" {
  description = "KMS key ARN for cross-account access and IAM policies"
  value       = aws_kms_key.main.arn
}

# CloudWatch metric alarm for key usage monitoring
resource "aws_cloudwatch_metric_alarm" "kms_key_usage" {
  count               = var.environment == "prod" ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-kms-key-usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "KeyUsage"
  namespace           = "AWS/KMS"
  period             = "300"
  statistic          = "Sum"
  threshold          = "1000"
  alarm_description  = "This metric monitors KMS key usage for potential security issues"
  alarm_actions      = [] # Add SNS topic ARN for notifications

  dimensions = {
    KeyId = aws_kms_key.main.key_id
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}