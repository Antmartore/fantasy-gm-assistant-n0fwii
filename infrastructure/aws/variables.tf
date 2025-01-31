# Core project variables
variable "project_name" {
  type        = string
  description = "Name of the Fantasy Sports GM Assistant project used for resource naming"
  default     = "fantasy-gm-assistant"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod) with specific resource configurations"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# AWS Region configuration
variable "aws_region" {
  type        = string
  description = "AWS region for resource deployment with multi-region support"
  default     = "us-west-2"
}

# VPC Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC following security best practices"
  default     = "10.0.0.0/16"
  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for multi-AZ deployment with high availability"
  default     = ["us-west-2a", "us-west-2b", "us-west-2c"]
}

# ECS API Service Configuration
variable "ecs_api_cpu" {
  type        = map(number)
  description = "CPU units for API service tasks per environment"
  default = {
    dev     = 1024
    staging = 2048
    prod    = 4096
  }
}

variable "ecs_api_memory" {
  type        = map(number)
  description = "Memory (MiB) for API service tasks per environment"
  default = {
    dev     = 2048
    staging = 4096
    prod    = 8192
  }
}

# ECS Worker Service Configuration
variable "ecs_worker_cpu" {
  type        = map(number)
  description = "CPU units for worker service tasks per environment"
  default = {
    dev     = 1024
    staging = 2048
    prod    = 4096
  }
}

variable "ecs_worker_memory" {
  type        = map(number)
  description = "Memory (MiB) for worker service tasks per environment"
  default = {
    dev     = 2048
    staging = 4096
    prod    = 8192
  }
}

# Redis Configuration
variable "redis_node_type" {
  type        = map(string)
  description = "ElastiCache Redis node type per environment"
  default = {
    dev     = "cache.t3.small"
    staging = "cache.t3.medium"
    prod    = "cache.r6g.large"
  }
}

variable "redis_num_cache_nodes" {
  type        = map(number)
  description = "Number of cache nodes in Redis cluster per environment"
  default = {
    dev     = 1
    staging = 2
    prod    = 3
  }
}

# Domain Configuration
variable "domain_name" {
  type        = map(string)
  description = "Domain name for the application per environment"
  default = {
    dev     = "dev.fantasygm.example.com"
    staging = "staging.fantasygm.example.com"
    prod    = "fantasygm.example.com"
  }
}

# Monitoring Configuration
variable "enable_monitoring" {
  type        = map(bool)
  description = "Enable CloudWatch monitoring and alerts per environment"
  default = {
    dev     = false
    staging = true
    prod    = true
  }
}