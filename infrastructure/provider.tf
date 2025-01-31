# Provider configuration for Fantasy Sports GM Assistant infrastructure
# Provider versions:
# - hashicorp/aws ~> 4.0
# - hashicorp/google ~> 4.0
# - datadog/datadog ~> 3.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 4.0"
    }
    datadog = {
      source  = "datadog/datadog"
      version = "~> 3.0"
    }
  }
}

# AWS Provider configuration with enhanced security features
provider "aws" {
  region = var.aws_region

  # Enhanced security with IAM role assumption
  assume_role {
    role_arn     = "arn:aws:iam::${var.aws_account_id}:role/TerraformDeployment-${var.environment}"
    session_name = "terraform-${var.project_name}-${var.environment}"
    external_id  = var.aws_external_id
  }

  # Comprehensive resource tagging strategy
  default_tags {
    tags = {
      Project             = var.project_name
      Environment        = var.environment
      ManagedBy         = "terraform"
      SecurityLevel     = "high"
      DataClassification = "sensitive"
      ComplianceScope   = "gdpr-ccpa"
    }
  }

  # Enhanced security and compliance settings
  s3_force_path_style = false
  max_retries         = 5
  
  # Account restriction for security
  allowed_account_ids = [var.aws_account_id]
}

# Google Provider configuration for Firebase services
provider "google" {
  project     = var.project_name
  region      = var.firebase_region
  credentials = file(var.google_credentials_path)

  # Service account impersonation for enhanced security
  impersonate_service_account = var.service_account_email

  # Request timeout settings
  request_timeout = "60s"
  
  # Enhanced retry settings
  user_project_override = true
  request_reason       = "terraform-${var.environment}-deployment"
}

# DataDog Provider configuration for comprehensive monitoring
provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
  api_url = var.datadog_api_url

  # Validation and security settings
  validate = true
  
  # Environment-specific configuration
  metrics_prefix = "${var.project_name}-${var.environment}"
}

# AWS Provider alias for multi-region deployment
provider "aws" {
  alias  = "us-east-1"
  region = "us-east-1"

  assume_role {
    role_arn     = "arn:aws:iam::${var.aws_account_id}:role/TerraformDeployment-${var.environment}"
    session_name = "terraform-${var.project_name}-${var.environment}-useast1"
    external_id  = var.aws_external_id
  }

  default_tags {
    tags = {
      Project             = var.project_name
      Environment        = var.environment
      ManagedBy         = "terraform"
      SecurityLevel     = "high"
      DataClassification = "sensitive"
      ComplianceScope   = "gdpr-ccpa"
      Region            = "us-east-1"
    }
  }
}

# AWS Provider alias for disaster recovery region
provider "aws" {
  alias  = "dr-region"
  region = var.dr_region

  assume_role {
    role_arn     = "arn:aws:iam::${var.aws_account_id}:role/TerraformDeployment-${var.environment}"
    session_name = "terraform-${var.project_name}-${var.environment}-dr"
    external_id  = var.aws_external_id
  }

  default_tags {
    tags = {
      Project             = var.project_name
      Environment        = var.environment
      ManagedBy         = "terraform"
      SecurityLevel     = "high"
      DataClassification = "sensitive"
      ComplianceScope   = "gdpr-ccpa"
      Region            = var.dr_region
      Purpose           = "disaster-recovery"
    }
  }
}