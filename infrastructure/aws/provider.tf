# AWS Provider Configuration for Fantasy Sports GM Assistant
# Version: ~> 4.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Main AWS provider configuration for primary region
provider "aws" {
  region = var.aws_region

  # Default tags applied to all resources
  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
      Application = "FantasyGMAssistant"
      CreatedAt   = timestamp()
    }
  }

  # Enhanced security configurations
  assume_role {
    role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformDeploymentRole"
    session_name = "TerraformDeployment-${var.environment}"
  }

  # Provider-level configurations
  allowed_account_ids = [data.aws_caller_identity.current.account_id]
  
  # S3 endpoint configuration for enhanced security
  endpoints {
    s3 = "s3.${var.aws_region}.amazonaws.com"
  }
}

# Secondary region provider for disaster recovery and multi-region deployments
provider "aws" {
  alias  = "secondary"
  region = "us-east-1" # Secondary region for disaster recovery

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
      Application = "FantasyGMAssistant"
      Region      = "Secondary"
      CreatedAt   = timestamp()
    }
  }

  assume_role {
    role_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/TerraformDeploymentRole"
    session_name = "TerraformDeployment-${var.environment}-Secondary"
  }
}

# Data source for current AWS account information
data "aws_caller_identity" "current" {}

# Data source for current AWS region
data "aws_region" "current" {}

# Provider feature flags
provider "aws" {
  alias = "features"

  # Enable AWS provider features
  ignore_tags {
    key_prefixes = ["AutoTag_"]
    keys         = ["CreatedByAWS"]
  }

  # Default retry configuration
  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
    }
  }

  # Configure retry behavior
  retry_mode = "standard"
  max_retries = 5
}

# CloudFront provider configuration for global edge locations
provider "aws" {
  alias  = "cloudfront"
  region = "us-east-1" # CloudFront requires US East 1

  default_tags {
    tags = {
      Environment = var.environment
      Project     = var.project_name
      ManagedBy   = "Terraform"
      Service     = "CloudFront"
    }
  }
}