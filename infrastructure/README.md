# Fantasy Sports GM Assistant Infrastructure

## Overview

This document provides comprehensive documentation for the infrastructure setup, deployment, and maintenance of the Fantasy Sports GM Assistant application. The infrastructure is built using Infrastructure as Code (IaC) principles with Terraform, leveraging AWS services for core infrastructure and Firebase for real-time features.

## Prerequisites

### Required Tools
- Terraform >= 1.5.0
- AWS CLI >= 2.0.0
- Firebase CLI >= 12.0.0
- Docker >= 24.0.0
- Python >= 3.11.0
- Node.js >= 18.0.0

### Required Credentials
- AWS IAM credentials with administrative access
- Firebase service account key
- DataDog API and Application keys
- GitHub Actions secrets configured

## Directory Structure

```
infrastructure/
├── aws/                    # AWS Terraform configurations
│   ├── cloudfront.tf       # CDN configuration
│   ├── ecs.tf             # Container orchestration
│   ├── elasticache.tf     # Redis cache setup
│   ├── iam.tf             # IAM roles and policies
│   ├── rds.tf             # Database configuration
│   ├── s3.tf              # Storage buckets
│   └── vpc.tf             # Network configuration
├── firebase/              # Firebase configurations
│   ├── firebase.json      # Project configuration
│   ├── firestore.rules    # Database rules
│   └── storage.rules      # Storage rules
├── monitoring/            # Monitoring configurations
│   ├── datadog.tf         # DataDog setup
│   ├── grafana/           # Grafana dashboards
│   └── prometheus/        # Prometheus configuration
├── scripts/               # Management scripts
│   ├── deploy.sh          # Deployment script
│   ├── backup.sh          # Backup procedure
│   └── monitoring.sh      # Monitoring setup
└── variables/             # Environment variables
    ├── dev.tfvars         # Development
    ├── staging.tfvars     # Staging
    └── prod.tfvars        # Production
```

## AWS Resources

### ECS Configuration
- Cluster: t3.large instances
- Auto-scaling: 2-10 instances
- Load balancing: Application Load Balancer
- Task definitions: API and Worker services

### Storage Configuration
- S3 buckets with lifecycle policies
- CloudFront CDN with edge locations
- ElastiCache Redis cluster for caching

### Networking
- VPC with public/private subnets
- NAT Gateway for private subnet access
- Security groups and NACLs

## Firebase Setup

### Project Configuration
```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  },
  "storage": {
    "rules": "storage.rules"
  }
}
```

### Security Rules
- Authentication required for all operations
- Rate limiting implemented
- Data validation enforced

## Monitoring

### DataDog Integration
- Custom dashboards for key metrics
- Automated alerts for critical events
- APM for performance monitoring
- Log aggregation and analysis

### Health Checks
- Endpoint monitoring
- Resource utilization
- Error rate tracking
- Performance metrics

## Deployment

### Development Environment
```bash
# Initialize infrastructure
terraform init -backend-config=variables/dev.tfvars

# Plan changes
terraform plan -var-file=variables/dev.tfvars

# Apply changes
terraform apply -var-file=variables/dev.tfvars
```

### Production Deployment
```bash
# Production deployment with approval
./scripts/deploy.sh production --approve

# Rollback procedure
./scripts/deploy.sh rollback --version=<version>
```

## Scripts

### Deployment Script
```bash
#!/bin/bash
# deploy.sh
environment=$1
version=$2

echo "Deploying to $environment version $version"
terraform init -backend-config=variables/$environment.tfvars
terraform apply -var-file=variables/$environment.tfvars
```

### Backup Procedure
```bash
#!/bin/bash
# backup.sh
date=$(date +%Y%m%d)
aws s3 sync s3://fantasy-gm-data s3://fantasy-gm-backup/$date
```

## Security

### Access Control
- IAM roles with least privilege
- MFA required for administrative access
- Regular access review

### Encryption
- Data encrypted at rest (AES-256)
- TLS 1.3 for data in transit
- KMS for key management

### Compliance
- Regular security audits
- Automated vulnerability scanning
- Compliance reporting

## Troubleshooting

### Common Issues
1. ECS Service Deployment Failures
   - Check task definition compatibility
   - Verify container health checks
   - Review CloudWatch logs

2. CDN Cache Issues
   - Verify cache settings
   - Check origin health
   - Review cache invalidation

3. Monitoring Alerts
   - Investigate CloudWatch metrics
   - Review application logs
   - Check resource utilization

### Debug Procedures
```bash
# Check ECS service status
aws ecs describe-services --cluster fantasy-gm --services api-service

# View CloudWatch logs
aws logs get-log-events --log-group-name /ecs/fantasy-gm --log-stream-name api-service

# Test CDN endpoints
curl -I https://cdn.fantasy-gm.com/assets/
```

## Metadata
- Last Updated: Must be updated within 24 hours of infrastructure changes
- Maintainers: DevOps team
- Review Schedule:
  - Security: Quarterly
  - Cost: Monthly
  - Performance: Bi-weekly
  - General: Monthly

For additional support, contact the DevOps team or refer to the internal documentation portal.