# Terraform outputs configuration for Fantasy Sports GM Assistant monitoring infrastructure
# Provider version: hashicorp/terraform ~> 1.0

# Main monitoring dashboard URL for centralized observability
output "monitoring_dashboard_url" {
  description = "URL for the main Datadog monitoring dashboard for fantasy sports analytics"
  value       = datadog_dashboard_fantasy_overview.url
  sensitive   = false
}

# Grafana monitoring interface URL
output "grafana_url" {
  description = "Secure HTTPS URL for accessing Grafana monitoring dashboards"
  value       = "https://${grafana_endpoint.dns_name}"
  sensitive   = false
}

# Prometheus metrics endpoint
output "prometheus_endpoint" {
  description = "Endpoint URL for Prometheus metrics collection and scraping"
  value       = prometheus_endpoint
  sensitive   = false
}

# Security group IDs for monitoring service access control
output "monitoring_security_groups" {
  description = "Map of security group IDs for monitoring services access control"
  value = {
    grafana    = grafana_security_group_id
    prometheus = prometheus_security_group_id
  }
  sensitive = false
}

# Alert webhook endpoints for monitoring integrations
output "alert_endpoints" {
  description = "Map of webhook endpoints for monitoring alerts integration"
  value = {
    datadog  = "${datadog_dashboard_fantasy_overview.id}/monitors"
    grafana  = "https://${grafana_endpoint.dns_name}/api/alerts"
  }
  sensitive = false
}