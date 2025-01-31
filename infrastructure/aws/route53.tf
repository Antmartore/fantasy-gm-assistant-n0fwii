# AWS Route 53 configuration for Fantasy Sports GM Assistant
# Provider version: hashicorp/aws ~> 4.0

# Primary hosted zone for the domain
resource "aws_route53_zone" "main" {
  name          = var.domain_name[var.environment]
  comment       = "Managed by Terraform - Fantasy GM Assistant ${var.environment}"
  force_destroy = false

  tags = {
    Name           = "${var.project_name}-${var.environment}-zone"
    Environment    = var.environment
    Project        = var.project_name
    ManagedBy      = "Terraform"
    SecurityLevel  = "High"
    BackupEnabled  = "True"
  }
}

# Primary health check for the domain
resource "aws_route53_health_check" "primary" {
  fqdn              = var.domain_name[var.environment]
  port              = 443
  type              = "HTTPS"
  resource_path     = "/health"
  failure_threshold = "3"
  request_interval  = "30"
  regions          = ["us-west-1", "us-east-1", "eu-west-1"]
  
  tags = {
    Name        = "${var.project_name}-${var.environment}-health-check"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# DNS record for CloudFront distribution (IPv4)
resource "aws_route53_record" "cloudfront_alias_ipv4" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name[var.environment]
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.primary.id
  set_identifier  = "primary"
  
  weighted_routing_policy {
    weight = 100
  }

  latency_routing_policy {
    region = var.aws_region
  }

  failover_routing_policy {
    type = "PRIMARY"
  }
}

# DNS record for CloudFront distribution (IPv6)
resource "aws_route53_record" "cloudfront_alias_ipv6" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name[var.environment]
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = true
  }
}

# Enable query logging
resource "aws_cloudwatch_log_group" "dns_logs" {
  name              = "/aws/route53/${var.project_name}-${var.environment}-dns-logs"
  retention_in_days = 30
  kms_key_id       = aws_kms_key.main.arn

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

resource "aws_route53_query_log" "main" {
  depends_on = [aws_route53_zone.main]

  cloudwatch_log_group_arn = aws_cloudwatch_log_group.dns_logs.arn
  zone_id                  = aws_route53_zone.main.zone_id
}

# DNS failover health check alarm
resource "aws_cloudwatch_metric_alarm" "dns_health_check" {
  alarm_name          = "${var.project_name}-${var.environment}-dns-health"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "HealthCheckStatus"
  namespace           = "AWS/Route53"
  period             = "60"
  statistic          = "Minimum"
  threshold          = "1"
  alarm_description  = "Route 53 health check status for ${var.domain_name[var.environment]}"
  alarm_actions      = []  # Add SNS topic ARN for notifications

  dimensions = {
    HealthCheckId = aws_route53_health_check.primary.id
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "Terraform"
  }
}

# Outputs for other resources
output "route53_zone_id" {
  description = "ID of the Route 53 hosted zone"
  value       = aws_route53_zone.main.zone_id
}

output "route53_name_servers" {
  description = "Name servers for the Route 53 zone"
  value       = aws_route53_zone.main.name_servers
}