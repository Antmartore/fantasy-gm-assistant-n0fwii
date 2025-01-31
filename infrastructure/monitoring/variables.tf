# Core Terraform variables for monitoring infrastructure
# Provider version: hashicorp/terraform ~> 1.0

variable "project_name" {
  type        = string
  description = "Name of the project for resource naming"
  default     = "fantasy-gm-assistant"
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "datadog_api_key" {
  type        = string
  description = "Datadog API key for authentication"
  sensitive   = true
  validation {
    condition     = length(var.datadog_api_key) > 30
    error_message = "Datadog API key must be valid and complete."
  }
}

variable "datadog_app_key" {
  type        = string
  description = "Datadog application key for API access"
  sensitive   = true
  validation {
    condition     = length(var.datadog_app_key) > 30
    error_message = "Datadog APP key must be valid and complete."
  }
}

variable "grafana_admin_password" {
  type        = string
  description = "Grafana admin user password"
  sensitive   = true
  validation {
    condition     = length(var.grafana_admin_password) >= 12
    error_message = "Grafana admin password must be at least 12 characters long."
  }
}

variable "prometheus_retention_days" {
  type        = number
  description = "Number of days to retain Prometheus metrics"
  default     = 15
  validation {
    condition     = var.prometheus_retention_days >= 7 && var.prometheus_retention_days <= 90
    error_message = "Prometheus retention days must be between 7 and 90."
  }
}

variable "alert_email_recipients" {
  type        = list(string)
  description = "List of email addresses for monitoring alerts"
  validation {
    condition     = alltrue([for email in var.alert_email_recipients : can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", email))])
    error_message = "All email addresses must be in valid format."
  }
}

variable "monitoring_instance_type" {
  type        = string
  description = "EC2 instance type for monitoring services"
  default     = "t3.large"
  validation {
    condition     = can(regex("^t3\\.(medium|large|xlarge)$", var.monitoring_instance_type))
    error_message = "Monitoring instance type must be t3.medium, t3.large, or t3.xlarge."
  }
}

# Import VPC ID from network configuration
variable "vpc_id" {
  type        = string
  description = "VPC ID for monitoring resources deployment"
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
    Component   = "monitoring"
  }

  monitoring_tags = merge(local.common_tags, {
    Service = "monitoring"
  })
}