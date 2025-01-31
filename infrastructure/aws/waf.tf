# AWS WAF configuration for Fantasy GM Assistant application
# Provider version: hashicorp/aws ~> 4.0

# IP Set for known malicious actors
resource "aws_wafv2_ip_set" "bad_actors" {
  name               = "${var.project_name}-${var.environment}-bad-actors"
  description        = "IP set for known malicious actors and blocked IPs"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = [] # Managed through external process

  tags = {
    Environment   = var.environment
    Project       = "FantasyGMAssistant"
    SecurityLevel = "High"
    ManagedBy     = "Terraform"
  }
}

# Regex Pattern Set for SQL Injection patterns
resource "aws_wafv2_regex_pattern_set" "sql_injection" {
  name        = "${var.project_name}-${var.environment}-sql-injection"
  description = "Regex patterns for SQL injection detection"
  scope       = "CLOUDFRONT"

  regular_expression {
    regex_string = "(?i)(select|insert|update|delete|drop|union|exec|declare).*"
  }

  tags = {
    Environment   = var.environment
    Project       = "FantasyGMAssistant"
    SecurityLevel = "High"
    ManagedBy     = "Terraform"
  }
}

# Main WAF Web ACL
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-${var.environment}-web-acl"
  description = "Enhanced WAF rules for Fantasy GM Assistant application"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # AWS Managed Core Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled  = true
    }
  }

  # AWS Managed Known Bad Inputs
  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "AWSManagedRulesKnownBadInputsMetric"
      sampled_requests_enabled  = true
    }
  }

  # IP Reputation List
  rule {
    name     = "IPReputationList"
    priority = 3

    action {
      block {}
    }

    statement {
      ip_set_reference_statement {
        arn = aws_wafv2_ip_set.bad_actors.arn
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "IPReputationListMetric"
      sampled_requests_enabled  = true
    }
  }

  # Rate-based rule for DDoS protection
  rule {
    name     = "RateLimitRule"
    priority = 4

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RateLimitRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  # API Path Rate Limiting
  rule {
    name     = "APIRateLimit"
    priority = 5

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"

        scope_down_statement {
          byte_match_statement {
            field_to_match {
              uri_path {}
            }
            positional_constraint = "STARTS_WITH"
            search_string        = "/api/"
            text_transformation {
              priority = 1
              type     = "NONE"
            }
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "APIRateLimitMetric"
      sampled_requests_enabled  = true
    }
  }

  # Request Size Limitation
  rule {
    name     = "RequestSizeLimit"
    priority = 6

    action {
      block {}
    }

    statement {
      size_constraint_statement {
        comparison_operator = "GT"
        size               = 131072 # 128KB

        field_to_match {
          body {}
        }

        text_transformation {
          priority = 1
          type     = "NONE"
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "RequestSizeLimitMetric"
      sampled_requests_enabled  = true
    }
  }

  # Geographic Blocking
  rule {
    name     = "GeoBlockRule"
    priority = 7

    action {
      block {}
    }

    statement {
      geo_match_statement {
        country_codes = ["NK", "IR", "CU"] # Blocked countries
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name               = "GeoBlockRuleMetric"
      sampled_requests_enabled  = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name               = "${var.project_name}-${var.environment}-web-acl-metric"
    sampled_requests_enabled  = true
  }

  tags = {
    Environment   = var.environment
    Project       = "FantasyGMAssistant"
    SecurityLevel = "High"
    ManagedBy     = "Terraform"
  }
}

# WAF Web ACL Association with CloudFront
resource "aws_wafv2_web_acl_association" "cloudfront" {
  resource_arn = aws_cloudfront_distribution.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

# WAF Web ACL Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "main" {
  log_destination_configs = [aws_kinesis_firehose_delivery_stream.waf_logs.arn]
  resource_arn           = aws_wafv2_web_acl.main.arn

  logging_filter {
    default_behavior = "KEEP"

    filter {
      behavior = "KEEP"
      condition {
        action_condition {
          action = "BLOCK"
        }
      }
      requirement = "MEETS_ANY"
    }
  }
}

# Export the Web ACL ARN for use in other configurations
output "web_acl_arn" {
  description = "ARN of the WAF Web ACL for CloudFront and API Gateway integration"
  value       = aws_wafv2_web_acl.main.arn
}