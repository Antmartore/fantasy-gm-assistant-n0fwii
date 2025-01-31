# Root Terraform version constraints and required provider configurations
# for Fantasy Sports GM Assistant infrastructure

terraform {
  # Terraform version constraint
  required_version = "~> 1.5.0"

  # Required provider configurations with version constraints
  required_providers {
    # AWS provider for core cloud infrastructure
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }

    # Datadog provider for monitoring and observability
    datadog = {
      source  = "datadog/datadog"
      version = "3.30.0"
    }

    # Grafana provider for metrics visualization
    grafana = {
      source  = "grafana/grafana"
      version = "~> 1.0"
    }

    # Firebase provider for authentication and real-time database
    firebase = {
      source  = "terraform-google-modules/firebase"
      version = "~> 1.0"
    }
  }
}