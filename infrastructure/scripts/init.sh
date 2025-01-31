#!/bin/bash

# Fantasy Sports GM Assistant Infrastructure Initialization Script
# Version: 1.0.0
# Requires: aws-cli >= 2.0, terraform >= 1.5, jq >= 1.6

set -euo pipefail

# Global variables
readonly PROJECT_ROOT="$(pwd)/.."
readonly ENVIRONMENT="${1:-dev}"
readonly AWS_REGION="us-east-1"
readonly TERRAFORM_WORKSPACE="${PROJECT_ROOT}/infrastructure"
readonly LOG_FILE="/var/log/fantasy-gm-init.log"
readonly BACKUP_RETENTION_DAYS=30
readonly ALERT_SNS_TOPIC="arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:infrastructure-alerts"

# Logging setup
setup_logging() {
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting infrastructure initialization..."
}

# Error handling
error_handler() {
    local exit_code=$?
    local line_number=$1
    echo "[ERROR] Failed at line ${line_number} with exit code ${exit_code}"
    notify_error "Infrastructure initialization failed at line ${line_number}"
    cleanup_on_failure
    exit "${exit_code}"
}
trap 'error_handler ${LINENO}' ERR

# Notification function
notify_error() {
    local message="$1"
    aws sns publish \
        --topic-arn "${ALERT_SNS_TOPIC}" \
        --message "${message}" \
        --region "${AWS_REGION}"
}

# Cleanup function
cleanup_on_failure() {
    echo "Performing cleanup..."
    # Remove any temporary files
    rm -f /tmp/fantasy-gm-*.tmp
    # Revert any partial infrastructure changes
    if [ -f "${TERRAFORM_WORKSPACE}/terraform.tfstate" ]; then
        terraform destroy -auto-approve || true
    fi
}

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        echo "AWS CLI is not installed. Please install version 2.0 or higher."
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "AWS credentials not configured or invalid."
        exit 1
    }
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        echo "Terraform is not installed. Please install version 1.5 or higher."
        exit 1
    }
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        echo "jq is not installed. Please install version 1.6 or higher."
        exit 1
    }
    
    # Validate environment
    if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod)$ ]]; then
        echo "Invalid environment. Must be one of: dev, staging, prod"
        exit 1
    }
}

# Setup Terraform backend
setup_terraform_backend() {
    echo "Setting up Terraform backend..."
    
    local bucket_name="fantasy-gm-terraform-${ENVIRONMENT}"
    local dynamodb_table="fantasy-gm-terraform-lock-${ENVIRONMENT}"
    
    # Create S3 bucket with encryption
    aws s3api create-bucket \
        --bucket "${bucket_name}" \
        --region "${AWS_REGION}" \
        --acl private
    
    # Enable versioning
    aws s3api put-bucket-versioning \
        --bucket "${bucket_name}" \
        --versioning-configuration Status=Enabled
    
    # Enable encryption
    aws s3api put-bucket-encryption \
        --bucket "${bucket_name}" \
        --server-side-encryption-configuration '{
            "Rules": [
                {
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256"
                    }
                }
            ]
        }'
    
    # Create DynamoDB table for state locking
    aws dynamodb create-table \
        --table-name "${dynamodb_table}" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5 \
        --region "${AWS_REGION}"
}

# Initialize AWS resources
initialize_aws_resources() {
    echo "Initializing AWS resources..."
    
    # Initialize Terraform
    cd "${TERRAFORM_WORKSPACE}"
    terraform init \
        -backend-config="bucket=fantasy-gm-terraform-${ENVIRONMENT}" \
        -backend-config="key=terraform.tfstate" \
        -backend-config="region=${AWS_REGION}" \
        -backend-config="dynamodb_table=fantasy-gm-terraform-lock-${ENVIRONMENT}"
    
    # Apply Terraform configuration
    terraform workspace select "${ENVIRONMENT}" || terraform workspace new "${ENVIRONMENT}"
    terraform apply -auto-approve
}

# Setup monitoring
setup_monitoring() {
    echo "Setting up monitoring..."
    
    # Configure CloudWatch alarms
    aws cloudwatch put-metric-alarm \
        --alarm-name "fantasy-gm-${ENVIRONMENT}-cpu-utilization" \
        --alarm-description "CPU utilization threshold exceeded" \
        --metric-name CPUUtilization \
        --namespace AWS/ECS \
        --statistic Average \
        --period 300 \
        --threshold 80 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions "${ALERT_SNS_TOPIC}" \
        --dimensions Name=ClusterName,Value="fantasy-gm-${ENVIRONMENT}"
    
    # Setup log retention
    aws logs put-retention-policy \
        --log-group-name "/aws/ecs/fantasy-gm-${ENVIRONMENT}" \
        --retention-in-days "${BACKUP_RETENTION_DAYS}"
}

# Configure security
configure_security() {
    echo "Configuring security measures..."
    
    # Enable AWS WAF
    aws wafv2 create-web-acl \
        --name "fantasy-gm-${ENVIRONMENT}-waf" \
        --scope REGIONAL \
        --default-action Block={} \
        --rules file://"${PROJECT_ROOT}/infrastructure/security/waf-rules.json" \
        --region "${AWS_REGION}"
    
    # Enable GuardDuty
    aws guardduty create-detector \
        --enable \
        --finding-publishing-frequency FIFTEEN_MINUTES \
        --region "${AWS_REGION}"
    
    # Enable AWS Shield Advanced (if production)
    if [ "${ENVIRONMENT}" = "prod" ]; then
        aws shield create-subscription
    fi
}

# Validate deployment
validate_deployment() {
    echo "Validating deployment..."
    
    # Check VPC status
    vpc_status=$(aws ec2 describe-vpcs \
        --filters "Name=tag:Environment,Values=${ENVIRONMENT}" \
        --query 'Vpcs[0].State' \
        --output text)
    if [ "${vpc_status}" != "available" ]; then
        echo "VPC validation failed"
        return 1
    }
    
    # Check ECS cluster status
    cluster_status=$(aws ecs describe-clusters \
        --clusters "fantasy-gm-${ENVIRONMENT}" \
        --query 'clusters[0].status' \
        --output text)
    if [ "${cluster_status}" != "ACTIVE" ]; then
        echo "ECS cluster validation failed"
        return 1
    }
    
    # Verify monitoring
    if ! aws cloudwatch describe-alarms \
        --alarm-names "fantasy-gm-${ENVIRONMENT}-cpu-utilization" \
        &> /dev/null; then
        echo "Monitoring validation failed"
        return 1
    }
    
    echo "Deployment validation successful"
    return 0
}

# Main execution
main() {
    setup_logging
    check_prerequisites
    setup_terraform_backend
    initialize_aws_resources
    setup_monitoring
    configure_security
    validate_deployment
    
    echo "Infrastructure initialization completed successfully"
    exit 0
}

main "$@"