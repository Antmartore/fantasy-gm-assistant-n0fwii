# Core Terraform version and provider requirements for monitoring infrastructure
terraform {
  # Require Terraform version ~> 1.0 (1.0.x)
  required_version = "~> 1.0"

  # Required provider configurations for monitoring infrastructure
  required_providers {
    # AWS provider for CloudWatch monitoring
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"  # Allows 4.x versions but not 5.x
    }

    # Datadog provider for metrics and monitoring
    datadog = {
      source  = "datadog/datadog"
      version = "3.30.0"  # Pinned to specific version for stability
    }

    # Grafana provider for visualization and dashboards
    grafana = {
      source  = "grafana/grafana"
      version = "~> 1.0"  # Allows 1.x versions
    }
  }
}