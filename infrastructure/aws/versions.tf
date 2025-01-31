# Fantasy Sports GM Assistant Infrastructure
# Version constraints for Terraform and AWS provider
# Ensures consistent versioning across Development, Staging, and Production environments

terraform {
  # Terraform version constraint
  # Allows minor version updates within 1.5.x for security patches
  # while preventing breaking changes from major version updates
  required_version = "~> 1.5.0"

  # Required provider configurations
  required_providers {
    # AWS provider configuration
    # Version ~> 4.0 supports all required services:
    # - ECS (Container Orchestration)
    # - S3 (Media Storage)
    # - CloudFront (CDN)
    # - ElastiCache (Redis)
    # - Route 53 (DNS)
    # - CloudWatch (Monitoring)
    # - WAF (Web Application Firewall)
    # - Shield (DDoS Protection)
    # - KMS (Key Management)
    # - CloudTrail (Audit Logging)
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}