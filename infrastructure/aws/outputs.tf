# AWS Infrastructure Outputs for Fantasy Sports GM Assistant
# Terraform version: ~> 1.0

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC where resources are deployed"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "List of public subnet IDs for load balancer placement"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs for ECS service placement"
  value       = aws_subnet.private[*].id
}

# ECS Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "ecs_api_service_name" {
  description = "Name of the ECS API service for deployment automation"
  value       = aws_ecs_service.api.name
}

output "ecs_worker_service_name" {
  description = "Name of the ECS worker service for deployment automation"
  value       = aws_ecs_service.worker.name
}

# Load Balancer Outputs
output "alb_dns_name" {
  description = "DNS name of the application load balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Route 53 zone ID of the application load balancer"
  value       = aws_lb.main.zone_id
}

# CloudFront Outputs
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution for cache invalidation"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

# Redis Outputs
output "redis_endpoint" {
  description = "Primary endpoint for the Redis cluster"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_port" {
  description = "Port number for Redis connections"
  value       = aws_elasticache_replication_group.main.port
}

# Security Group Outputs
output "alb_security_group_id" {
  description = "ID of the security group attached to the ALB"
  value       = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  description = "ID of the security group attached to ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}

# Service Discovery Outputs
output "service_discovery_namespace_id" {
  description = "ID of the service discovery private DNS namespace"
  value       = aws_service_discovery_private_dns_namespace.main.id
}

output "api_service_discovery_arn" {
  description = "ARN of the API service discovery service"
  value       = aws_service_discovery_service.api.arn
}

output "worker_service_discovery_arn" {
  description = "ARN of the worker service discovery service"
  value       = aws_service_discovery_service.worker.arn
}

# ECR Repository Outputs
output "api_repository_url" {
  description = "URL of the ECR repository for the API service"
  value       = aws_ecr_repository.api_service.repository_url
}

output "worker_repository_url" {
  description = "URL of the ECR repository for the worker service"
  value       = aws_ecr_repository.worker_service.repository_url
}

# IAM Role Outputs
output "ecs_execution_role_arn" {
  description = "ARN of the ECS execution role"
  value       = aws_iam_role.ecs_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

# Environment Outputs
output "environment" {
  description = "Current deployment environment"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region where resources are deployed"
  value       = var.aws_region
}

# Monitoring Outputs
output "cloudwatch_log_group_ecs" {
  description = "Name of the CloudWatch log group for ECS services"
  value       = aws_cloudwatch_log_group.ecs_cluster.name
}

output "cloudwatch_log_group_vpc" {
  description = "Name of the CloudWatch log group for VPC flow logs"
  value       = aws_cloudwatch_log_group.vpc_flow_log.name
}