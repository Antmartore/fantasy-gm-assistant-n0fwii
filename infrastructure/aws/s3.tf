# AWS S3 configuration for Fantasy Sports GM Assistant
# Provider version: ~> 4.0
# Terraform version: ~> 1.0

# Main media storage bucket for application assets
resource "aws_s3_bucket" "media" {
  bucket = "${var.project_name}-${var.environment}-media"
  force_destroy = false

  tags = {
    Name           = "${var.project_name}-${var.environment}-media"
    Environment    = var.environment
    Purpose        = "Application media storage"
    SecurityLevel  = "High"
    DataRetention  = "30days"
    ManagedBy      = "Terraform"
    Project        = var.project_name
    CostCenter     = "Media-Storage"
  }
}

# Enable versioning for media bucket
resource "aws_s3_bucket_versioning" "media_versioning" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status     = "Enabled"
    mfa_delete = var.environment == "prod" ? true : false
  }
}

# Configure server-side encryption using KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "media_encryption" {
  bucket = aws_s3_bucket.media.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = data.aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Configure lifecycle rules for cost optimization
resource "aws_s3_bucket_lifecycle_rule" "media_lifecycle" {
  bucket = aws_s3_bucket.media.id
  id     = "media_retention"
  enabled = true
  prefix = "media/"

  # Immediate transition to intelligent tiering for cost optimization
  transition {
    days          = 0
    storage_class = "INTELLIGENT_TIERING"
  }

  # 30-day retention policy for media files
  expiration {
    days = 30
  }

  # Clean up old versions after 7 days
  noncurrent_version_expiration {
    days = 7
  }

  # Clean up incomplete multipart uploads
  abort_incomplete_multipart_upload {
    days_after_initiation = 1
  }
}

# Configure CORS for secure web access
resource "aws_s3_bucket_cors_configuration" "media_cors" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["Authorization", "Content-Type", "x-amz-date", "x-amz-security-token"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["https://*.${var.project_name}.com"]
    expose_headers  = ["ETag", "x-amz-server-side-encryption", "x-amz-request-id"]
    max_age_seconds = 3600
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "media_public_access" {
  bucket = aws_s3_bucket.media.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Configure bucket policy for secure access
resource "aws_s3_bucket_policy" "media_bucket_policy" {
  bucket = aws_s3_bucket.media.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceSSLOnly"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          aws_s3_bucket.media.arn,
          "${aws_s3_bucket.media.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport": "false"
          }
        }
      },
      {
        Sid       = "DenyIncorrectEncryptionHeader"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource = "${aws_s3_bucket.media.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption": "aws:kms"
          }
        }
      }
    ]
  })
}

# Output the bucket ID for reference
output "media_bucket_id" {
  description = "ID of the media storage bucket"
  value       = aws_s3_bucket.media.id
}

# Output the bucket ARN for IAM policies
output "media_bucket_arn" {
  description = "ARN of the media storage bucket"
  value       = aws_s3_bucket.media.arn
}

# Output the bucket domain name for application use
output "media_bucket_domain_name" {
  description = "Domain name of the media storage bucket"
  value       = aws_s3_bucket.media.bucket_regional_domain_name
}