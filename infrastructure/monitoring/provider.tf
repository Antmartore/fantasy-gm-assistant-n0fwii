# Provider configuration for monitoring infrastructure
# AWS Provider version: ~> 4.0
# Datadog Provider version: 3.30.0
# Grafana Provider version: ~> 1.0

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    datadog = {
      source  = "datadog/datadog"
      version = "3.30.0"
    }
    grafana = {
      source  = "grafana/grafana"
      version = "~> 1.0"
    }
  }
}

# AWS provider configuration for CloudWatch and monitoring resources
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "fantasy-gm-assistant"
      ManagedBy   = "terraform"
      Component   = "monitoring"
    }
  }
}

# Datadog provider configuration for metrics collection and APM
provider "datadog" {
  api_key = var.datadog_api_key
  app_key = var.datadog_app_key
  api_url = "https://api.datadoghq.com/"
  validate = true
}

# Grafana provider configuration for visualization and dashboards
provider "grafana" {
  url  = "http://localhost:3000"
  auth = var.grafana_admin_password
}

# Provider configuration outputs for use in other modules
output "provider_configurations" {
  description = "Provider configurations for monitoring infrastructure"
  value = {
    aws_config = {
      region = var.aws_region
    }
    datadog_config = {
      api_url = "https://api.datadoghq.com/"
    }
    grafana_config = {
      url = "http://localhost:3000"
    }
  }
  sensitive = true
}