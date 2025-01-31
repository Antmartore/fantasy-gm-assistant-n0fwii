# AWS CloudFront configuration for Fantasy Sports GM Assistant
# Provider version: hashicorp/aws ~> 4.0

# Origin Access Identity for S3 bucket access
resource "aws_cloudfront_origin_access_identity" "main" {
  comment = "OAI for ${var.project_name}-${var.environment} media access"
}

# Random string for origin custom header verification
resource "random_string" "origin_verify" {
  length  = 32
  special = false
}

# CloudFront distribution for media content delivery
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled    = true
  http_version       = "http2and3"
  price_class        = "PriceClass_All"  # Global edge locations for optimal performance
  web_acl_id         = aws_wafv2_web_acl.main.arn
  aliases            = [var.domain_name[var.environment]]
  retain_on_delete   = false
  wait_for_deployment = false

  # Origin configuration for S3 media bucket
  origin {
    domain_name = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id   = "S3-${var.environment}-media-origin"

    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.main.cloudfront_access_identity_path
    }

    custom_header {
      name  = "X-Origin-Verify"
      value = random_string.origin_verify.result
    }
  }

  # Default cache behavior for media content
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.environment}-media-origin"
    compress        = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600  # 1 hour default cache
    max_ttl                = 86400 # 24 hours max cache

    forwarded_values {
      query_string = false
      headers      = ["Origin", "Access-Control-Request-Headers", "Access-Control-Request-Method"]

      cookies {
        forward = "none"
      }
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.security_headers.arn
    }
  }

  # Custom error responses
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404.html"
    error_caching_min_ttl = 10
  }

  # Logging configuration
  logging_config {
    include_cookies = false
    bucket         = aws_s3_bucket.logs.bucket_domain_name
    prefix         = "cloudfront/"
  }

  # Geographic restrictions - None as per requirements
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL/TLS configuration
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # Tags for resource management
  tags = {
    Name        = "${var.project_name}-${var.environment}-cloudfront"
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
    Purpose     = "Content delivery and media optimization"
  }
}

# CloudFront function for security headers
resource "aws_cloudfront_function" "security_headers" {
  name    = "${var.project_name}-${var.environment}-security-headers"
  runtime = "cloudfront-js-1.0"
  comment = "Add security headers to all responses"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var response = event.response;
      var headers = response.headers;
      
      headers['strict-transport-security'] = { value: 'max-age=31536000; includeSubdomains; preload'};
      headers['x-content-type-options'] = { value: 'nosniff'};
      headers['x-frame-options'] = { value: 'DENY'};
      headers['x-xss-protection'] = { value: '1; mode=block'};
      headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin'};
      headers['content-security-policy'] = { value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"};
      
      return response;
    }
  EOT
}

# CloudWatch metric alarm for error rate monitoring
resource "aws_cloudwatch_metric_alarm" "cloudfront_error_rate" {
  alarm_name          = "${var.project_name}-${var.environment}-cloudfront-error-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "TotalErrorRate"
  namespace           = "AWS/CloudFront"
  period             = "300"
  statistic          = "Average"
  threshold          = "5"
  alarm_description  = "CloudFront error rate exceeded 5%"
  alarm_actions      = []  # Add SNS topic ARN for notifications

  dimensions = {
    DistributionId = aws_cloudfront_distribution.main.id
    Region         = "Global"
  }
}

# Outputs for other resources
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}