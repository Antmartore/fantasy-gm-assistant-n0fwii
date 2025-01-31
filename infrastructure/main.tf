# Fantasy Sports GM Assistant - Main Infrastructure Configuration
# Version: 1.0.0

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.0"
    }
  }

  backend "s3" {
    bucket         = "fantasy-gm-assistant-terraform-state"
    key            = "terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "fantasy-gm-assistant-terraform-locks"
  }
}

# VPC and Network Configuration
module "vpc" {
  source = "./aws/vpc"

  project_name       = var.project_name
  environment        = var.environment
  vpc_cidr          = var.vpc_cidr
  availability_zones = var.availability_zones
}

# Security Configuration
module "security" {
  source = "./aws/security"

  project_name = var.project_name
  environment  = var.environment
  vpc_id       = module.vpc.vpc_id
}

# ECS Cluster Configuration
module "ecs" {
  source = "./aws/ecs"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_ids = module.security.security_group_ids

  api_service_config = {
    cpu    = var.ecs_api_cpu[var.environment]
    memory = var.ecs_api_memory[var.environment]
  }

  worker_service_config = {
    cpu    = var.ecs_worker_cpu[var.environment]
    memory = var.ecs_worker_memory[var.environment]
  }
}

# ElastiCache Redis Configuration
module "redis" {
  source = "./aws/redis"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnet_ids
  security_group_ids = module.security.security_group_ids
  node_type         = var.redis_node_type[var.environment]
  num_cache_nodes   = var.redis_num_cache_nodes[var.environment]
}

# S3 Storage Configuration
module "s3" {
  source = "./aws/s3"

  project_name = var.project_name
  environment  = var.environment
  kms_key_id   = module.security.kms_key_id

  lifecycle_rules = {
    media_files = {
      enabled = true
      expiration = {
        days = 30
      }
      transitions = [
        {
          days          = 7
          storage_class = "STANDARD_IA"
        }
      ]
    }
  }
}

# CloudFront Distribution
module "cloudfront" {
  source = "./aws/cloudfront"
  providers = {
    aws = aws.cloudfront
  }

  project_name    = var.project_name
  environment     = var.environment
  domain_name     = var.domain_name[var.environment]
  s3_bucket_id    = module.s3.bucket_id
  certificate_arn = module.security.acm_certificate_arn

  cache_behavior = {
    default = {
      min_ttl     = 0
      default_ttl = 3600
      max_ttl     = 86400
    }
    media = {
      path_pattern = "/media/*"
      min_ttl     = 3600
      default_ttl = 86400
      max_ttl     = 604800
    }
  }
}

# Monitoring and Alerting
module "monitoring" {
  source = "./aws/monitoring"
  count  = var.enable_monitoring[var.environment] ? 1 : 0

  project_name = var.project_name
  environment  = var.environment
  
  alarm_config = {
    api_latency = {
      threshold = 1000
      period    = 300
    }
    error_rate = {
      threshold = 1
      period    = 300
    }
    cpu_utilization = {
      threshold = 80
      period    = 300
    }
  }

  log_retention_days = 90
}

# Outputs
output "api_endpoint" {
  description = "API Gateway endpoint URL"
  value       = module.ecs.api_endpoint
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = module.cloudfront.domain_name
}

output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.vpc.vpc_id
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

# Tags
locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
    Application = "FantasyGMAssistant"
    CreatedAt   = timestamp()
  }
}

# Provider configuration from imported module
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  alias  = "cloudfront"
  region = "us-east-1"

  default_tags {
    tags = merge(local.common_tags, {
      Service = "CloudFront"
    })
  }
}