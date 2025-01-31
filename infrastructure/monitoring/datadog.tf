# Datadog Provider Configuration
# Provider version: datadog/datadog 3.30.0
terraform {
  required_providers {
    datadog = {
      source  = "DataDog/datadog"
      version = "3.30.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Local variables for resource configuration
locals {
  dd_tags = {
    environment = var.environment
    project     = "fantasy-gm-assistant"
    managed_by  = "terraform"
  }

  monitor_thresholds = {
    cpu_critical                  = 90
    memory_critical              = 85
    api_latency_critical         = 2000
    error_rate_critical          = 100
    trade_analysis_latency_critical = 5000
  }
}

# AWS Integration Configuration
data "aws_caller_identity" "current" {}

resource "datadog_integration_aws" "fantasy_gm" {
  account_id                  = data.aws_caller_identity.current.account_id
  role_name                  = "DatadogAWSIntegrationRole"
  metrics_collection_enabled = true
  resource_collection_enabled = true
  log_collection_enabled     = true
  
  excluded_regions = [
    "cn-north-1",
    "cn-northwest-1"
  ]
  
  filter_tags = [
    "Environment:${var.environment}",
    "Project:fantasy-gm-assistant"
  ]
}

# Main Application Dashboard
resource "datadog_dashboard" "fantasy_overview" {
  title       = "Fantasy GM Assistant - ${title(var.environment)} Overview"
  description = "Main operational dashboard for Fantasy Sports GM Assistant application"
  layout_type = "ordered"

  widget {
    group_definition {
      title = "API Performance"
      widget {
        timeseries_definition {
          title = "API Response Time by Endpoint"
          request {
            q = "avg:fantasy_gm.api.response_time{*} by {endpoint}.rollup(avg, 60)"
            display_type = "line"
          }
          yaxis {
            min = "0"
            max = "auto"
            label = "Response Time (ms)"
          }
        }
      }
      widget {
        toplist_definition {
          title = "Slowest API Endpoints (95th Percentile)"
          request {
            q = "top(avg:fantasy_gm.api.response_time{*} by {endpoint}, 10, 'max', 'desc')"
          }
        }
      }
    }
  }

  widget {
    group_definition {
      title = "User Activity"
      widget {
        query_value_definition {
          title = "Active Users (Last 15m)"
          request {
            q = "sum:fantasy_gm.users.active{*}.rollup(count, 900)"
          }
        }
      }
      widget {
        timeseries_definition {
          title = "User Actions by Type"
          request {
            q = "sum:fantasy_gm.user.actions{*} by {action_type}.as_count()"
          }
        }
      }
    }
  }

  widget {
    group_definition {
      title = "Trade Analysis Performance"
      widget {
        timeseries_definition {
          title = "Trade Analysis Response Time"
          request {
            q = "avg:fantasy_gm.trades.analysis_time{*} by {complexity}"
          }
        }
      }
      widget {
        query_value_definition {
          title = "Trade Analysis Success Rate"
          request {
            q = "100 * (sum:fantasy_gm.trades.success{*}.as_count() / sum:fantasy_gm.trades.total{*}.as_count())"
          }
        }
      }
    }
  }

  widget {
    group_definition {
      title = "System Health"
      widget {
        hostmap_definition {
          title = "Infrastructure Status"
          request {
            fill {
              q = "avg:system.cpu.user{*} by {host}"
            }
          }
        }
      }
      widget {
        timeseries_definition {
          title = "Memory Usage by Service"
          request {
            q = "avg:system.mem.used{*} by {service}"
          }
        }
      }
    }
  }
}

# API Latency Monitor
resource "datadog_monitor" "api_latency" {
  name    = "[${upper(var.environment)}] API High Latency Alert"
  type    = "metric alert"
  message = <<-EOT
    API endpoint {{endpoint}} response time is above ${local.monitor_thresholds.api_latency_critical}ms
    
    Current value: {{value}}ms
    Environment: ${var.environment}
    
    Impact: User experience degradation
    Possible causes:
    - High server load
    - Database bottlenecks
    - External service delays
    
    Actions:
    1. Check system metrics in dashboard: ${datadog_dashboard.fantasy_overview.url}
    2. Review recent deployments
    3. Check external service status
    
    @pagerduty @slack-sre-alerts
  EOT

  query = "avg(last_5m):avg:fantasy_gm.api.response_time{environment:${var.environment}} by {endpoint} > ${local.monitor_thresholds.api_latency_critical}"

  monitor_thresholds {
    critical = local.monitor_thresholds.api_latency_critical
    warning  = local.monitor_thresholds.api_latency_critical * 0.8
  }

  include_tags = true
  tags        = values(local.dd_tags)
}

# Error Rate Monitor
resource "datadog_monitor" "error_rate" {
  name    = "[${upper(var.environment)}] High Error Rate Alert"
  type    = "metric alert"
  message = <<-EOT
    Error rate is above threshold in ${var.environment} environment
    
    Current error count: {{value}}
    Error type: {{error_type}}
    
    Impact: Service reliability at risk
    Required actions:
    1. Check error logs in Datadog
    2. Review recent deployments
    3. Verify external dependencies
    4. Check system resources
    
    Dashboard: ${datadog_dashboard.fantasy_overview.url}
    
    @pagerduty @slack-sre-alerts
  EOT

  query = "sum(last_5m):sum:fantasy_gm.errors.count{environment:${var.environment}} by {error_type}.as_count() > ${local.monitor_thresholds.error_rate_critical}"

  monitor_thresholds {
    critical = local.monitor_thresholds.error_rate_critical
    warning  = local.monitor_thresholds.error_rate_critical * 0.7
  }

  include_tags = true
  tags        = values(local.dd_tags)
}

# Trade Analysis Performance Monitor
resource "datadog_monitor" "trade_analysis_latency" {
  name    = "[${upper(var.environment)}] Trade Analysis Performance Alert"
  type    = "metric alert"
  message = <<-EOT
    Trade analysis response time is above threshold in ${var.environment}
    
    Current latency: {{value}}ms
    Complexity level: {{complexity}}
    
    Impact: Trade analysis feature degradation
    Actions:
    1. Check ML service metrics
    2. Verify GPT-4 API status
    3. Review system resources
    
    Dashboard: ${datadog_dashboard.fantasy_overview.url}
    
    @pagerduty @slack-sre-alerts
  EOT

  query = "avg(last_5m):avg:fantasy_gm.trades.analysis_time{environment:${var.environment}} by {complexity} > ${local.monitor_thresholds.trade_analysis_latency_critical}"

  monitor_thresholds {
    critical = local.monitor_thresholds.trade_analysis_latency_critical
    warning  = local.monitor_thresholds.trade_analysis_latency_critical * 0.8
  }

  include_tags = true
  tags        = values(local.dd_tags)
}