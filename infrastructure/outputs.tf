# Core Network Outputs
output "vpc_id" {
  description = "ID of the primary VPC for Fantasy Sports GM Assistant"
  value       = aws_vpc.main.id
}

# ECS Cluster & Services
output "ecs_cluster_id" {
  description = "ID of the ECS cluster hosting application services"
  value       = aws_ecs_cluster.main.id
}

output "ecs_service_names" {
  description = "Map of ECS service names for API and worker components"
  value = {
    api    = aws_ecs_service.api.name
    worker = aws_ecs_service.worker.name
  }
}

# Application Endpoints
output "api_endpoint" {
  description = "HTTPS endpoint for the Fantasy Sports GM Assistant API"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "redis_endpoint" {
  description = "Redis cluster endpoint for application caching"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

# Content Delivery & Storage
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution for content delivery"
  value       = aws_cloudfront_distribution.main.id
}

output "s3_media_bucket" {
  description = "Name of the S3 bucket for media asset storage"
  value       = aws_s3_bucket.media.id
}

# DNS & Security
output "route53_zone_id" {
  description = "Route53 hosted zone ID for DNS management"
  value       = aws_route53_zone.main.zone_id
}

output "waf_web_acl_id" {
  description = "WAF web ACL ID for application security"
  value       = aws_wafv2_web_acl.main.id
}

# Monitoring & Observability
output "monitoring_dashboard_url" {
  description = "URL for the main CloudWatch monitoring dashboard"
  value       = "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "grafana_url" {
  description = "URL for accessing Grafana visualization dashboards"
  value       = aws_grafana_workspace.main.endpoint
}

output "alert_endpoints" {
  description = "Map of alert webhook endpoints for different notification channels"
  value = {
    slack     = aws_sns_topic.alerts_slack.arn
    pagerduty = aws_sns_topic.alerts_pagerduty.arn
    email     = aws_sns_topic.alerts_email.arn
  }
  sensitive = true
}

# Data Sources
data "aws_region" "current" {}