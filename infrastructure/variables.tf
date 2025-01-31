# Core Terraform variables for Fantasy Sports GM Assistant infrastructure
# Provider version: hashicorp/terraform ~> 1.0

# Project identification variables
variable "project_name" {
  type        = string
  description = "Name of the Fantasy Sports GM Assistant project"
  default     = "fantasy-gm-assistant"
}

variable "environment" {
  type        = string
  description = "Deployment environment (dev/staging/prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

# AWS configuration
variable "aws_region" {
  type        = string
  description = "Primary AWS region for resource deployment"
  default     = "us-west-2"
}

# Monitoring configuration
variable "enable_monitoring" {
  type        = bool
  description = "Global flag to enable/disable monitoring features"
  default     = true
}

variable "datadog_api_key" {
  type        = string
  description = "Datadog API key for monitoring integration"
  sensitive   = true
  validation {
    condition     = length(var.datadog_api_key) >= 32
    error_message = "Datadog API key must be at least 32 characters."
  }
}

variable "grafana_admin_password" {
  type        = string
  description = "Grafana admin user password"
  sensitive   = true
  validation {
    condition     = length(var.grafana_admin_password) >= 12 && can(regex("[A-Z]", var.grafana_admin_password)) && can(regex("[a-z]", var.grafana_admin_password)) && can(regex("[0-9]", var.grafana_admin_password)) && can(regex("[^A-Za-z0-9]", var.grafana_admin_password))
    error_message = "Grafana admin password must be at least 12 characters and contain uppercase, lowercase, numbers, and special characters."
  }
}

variable "alert_email_recipients" {
  type        = list(string)
  description = "List of email addresses for monitoring alerts"
  default     = []
  validation {
    condition     = alltrue([for email in var.alert_email_recipients : can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", email))])
    error_message = "All alert email recipients must be valid email addresses."
  }
}

variable "monitoring_retention_days" {
  type        = number
  description = "Number of days to retain monitoring data"
  default     = 90
  validation {
    condition     = var.monitoring_retention_days >= 30 && var.monitoring_retention_days <= 365
    error_message = "Monitoring retention days must be between 30 and 365."
  }
}

# Default tags to be applied to all resources
locals {
  default_tags = {
    Project           = "fantasy-gm-assistant"
    ManagedBy         = "terraform"
    Environment       = var.environment
    MonitoringEnabled = var.enable_monitoring
  }
}

# Output variables for use in other modules
output "project_name" {
  description = "Global project name for resource naming across all modules"
  value       = var.project_name
}

output "environment" {
  description = "Global environment name for resource tagging across all modules"
  value       = var.environment
}

output "aws_region" {
  description = "Primary AWS region for resource deployment"
  value       = var.aws_region
}

output "enable_monitoring" {
  description = "Global flag to enable/disable monitoring features"
  value       = var.enable_monitoring
}