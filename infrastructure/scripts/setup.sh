#!/bin/bash

# Fantasy Sports GM Assistant Infrastructure Setup Script
# Version: 1.0.0
# Description: Comprehensive setup script for development environment and infrastructure
# Dependencies: aws-cli >= 2.0, terraform >= 1.5, docker >= 24.0, python >= 3.11, node >= 18.x

set -euo pipefail

# Global variables
readonly PROJECT_ROOT="$(pwd)/.."
readonly ENVIRONMENT="${1:-dev}"
readonly AWS_REGION="us-east-1"
readonly TERRAFORM_WORKSPACE="${PROJECT_ROOT}/infrastructure"
readonly LOG_DIR="${PROJECT_ROOT}/logs"
readonly AUDIT_LOG="${LOG_DIR}/audit.log"
readonly SECURITY_SCAN_RESULTS="${LOG_DIR}/security_scan.json"
readonly MONITORING_CONFIG="${PROJECT_ROOT}/config/monitoring.yml"

# Logging setup
setup_logging() {
    mkdir -p "${LOG_DIR}"
    exec 1> >(tee -a "${AUDIT_LOG}")
    exec 2> >(tee -a "${AUDIT_LOG}" >&2)
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting infrastructure setup..."
}

# Error handling
error_handler() {
    local exit_code=$?
    local line_number=$1
    echo "[ERROR] Failed at line ${line_number} with exit code ${exit_code}"
    echo "[ERROR] Check ${AUDIT_LOG} for details"
    exit "${exit_code}"
}
trap 'error_handler ${LINENO}' ERR

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Docker check
    if ! docker info &> /dev/null; then
        echo "Docker daemon is not running or Docker is not installed"
        echo "Please install Docker version 24.0+ and start the daemon"
        return 1
    fi
    
    # AWS CLI check
    if ! aws --version | grep -q "aws-cli/2"; then
        echo "AWS CLI v2 is required but not installed"
        return 1
    fi
    
    # Terraform check
    if ! terraform version | grep -q "v1.5"; then
        echo "Terraform v1.5+ is required but not installed"
        return 1
    fi
    
    # Python check
    if ! python3 --version | grep -q "Python 3.11"; then
        echo "Python 3.11+ is required but not installed"
        return 1
    fi
    
    # Node.js check
    if ! node --version | grep -q "v18"; then
        echo "Node.js v18.x is required but not installed"
        return 1
    }
    
    # Environment validation
    if [[ ! "${ENVIRONMENT}" =~ ^(dev|staging|prod)$ ]]; then
        echo "Invalid environment. Must be one of: dev, staging, prod"
        return 1
    fi
    
    # AWS credentials check
    if ! aws sts get-caller-identity &> /dev/null; then
        echo "AWS credentials not configured or invalid"
        return 1
    fi
    
    echo "All prerequisites satisfied"
    return 0
}

# Configure security settings
configure_security() {
    echo "Configuring security measures..."
    
    # Generate SSL certificates
    if [[ ! -f "${PROJECT_ROOT}/config/ssl/server.crt" ]]; then
        mkdir -p "${PROJECT_ROOT}/config/ssl"
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${PROJECT_ROOT}/config/ssl/server.key" \
            -out "${PROJECT_ROOT}/config/ssl/server.crt" \
            -subj "/C=US/ST=CA/L=SanFrancisco/O=FantasyGM/CN=localhost"
    fi
    
    # Configure AWS WAF rules
    aws wafv2 create-web-acl \
        --name "fantasy-gm-${ENVIRONMENT}-waf" \
        --scope REGIONAL \
        --default-action Block={} \
        --rules file://"${PROJECT_ROOT}/config/security/waf-rules.json" \
        --region "${AWS_REGION}" || true
    
    # Setup AWS KMS keys
    aws kms create-key \
        --description "Fantasy GM ${ENVIRONMENT} encryption key" \
        --region "${AWS_REGION}" || true
    
    # Configure security groups
    aws ec2 create-security-group \
        --group-name "fantasy-gm-${ENVIRONMENT}-sg" \
        --description "Security group for Fantasy GM ${ENVIRONMENT}" || true
    
    # Enable CloudTrail
    aws cloudtrail create-trail \
        --name "fantasy-gm-${ENVIRONMENT}-trail" \
        --s3-bucket-name "fantasy-gm-${ENVIRONMENT}-audit-logs" \
        --is-multi-region-trail || true
    
    echo "Security configuration completed"
}

# Setup monitoring tools
setup_monitoring_tools() {
    echo "Setting up monitoring infrastructure..."
    
    # Create CloudWatch log groups
    aws logs create-log-group \
        --log-group-name "/fantasy-gm/${ENVIRONMENT}/application" || true
    
    aws logs put-retention-policy \
        --log-group-name "/fantasy-gm/${ENVIRONMENT}/application" \
        --retention-in-days 30
    
    # Configure CloudWatch alarms
    aws cloudwatch put-metric-alarm \
        --alarm-name "fantasy-gm-${ENVIRONMENT}-cpu-high" \
        --alarm-description "CPU utilization high" \
        --metric-name CPUUtilization \
        --namespace AWS/ECS \
        --statistic Average \
        --period 300 \
        --threshold 80 \
        --comparison-operator GreaterThanThreshold \
        --evaluation-periods 2 \
        --alarm-actions "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:alerts"
    
    # Setup Grafana (if production)
    if [[ "${ENVIRONMENT}" == "prod" ]]; then
        docker-compose -f "${PROJECT_ROOT}/monitoring/docker-compose.yml" up -d grafana
    fi
    
    echo "Monitoring setup completed"
}

# Initialize development environment
init_dev_environment() {
    echo "Initializing development environment..."
    
    # Setup Python virtual environment
    python3 -m venv "${PROJECT_ROOT}/.venv"
    source "${PROJECT_ROOT}/.venv/bin/activate"
    pip install -r "${PROJECT_ROOT}/requirements.txt"
    
    # Install Node.js dependencies
    npm install --prefix "${PROJECT_ROOT}/frontend"
    
    # Setup pre-commit hooks
    if [[ -f "${PROJECT_ROOT}/.pre-commit-config.yaml" ]]; then
        pre-commit install
    fi
    
    # Initialize Docker environment
    docker-compose -f "${PROJECT_ROOT}/docker-compose.yml" pull
    
    echo "Development environment initialized"
}

# Validate setup
validate_setup() {
    echo "Validating setup..."
    local status=0
    
    # Check Docker containers
    if ! docker ps &> /dev/null; then
        echo "Docker validation failed"
        status=1
    fi
    
    # Check AWS resources
    if ! aws cloudformation describe-stacks \
        --stack-name "fantasy-gm-${ENVIRONMENT}" &> /dev/null; then
        echo "AWS infrastructure validation failed"
        status=1
    fi
    
    # Check monitoring
    if ! curl -s "http://localhost:3000" &> /dev/null; then
        echo "Monitoring endpoint validation failed"
        status=1
    fi
    
    # Verify security configurations
    if ! aws kms list-keys &> /dev/null; then
        echo "Security configuration validation failed"
        status=1
    fi
    
    return $status
}

# Main execution
main() {
    setup_logging
    
    echo "Starting Fantasy GM Assistant setup for ${ENVIRONMENT} environment..."
    
    # Run setup steps
    check_prerequisites || exit 1
    configure_security || exit 1
    setup_monitoring_tools || exit 1
    init_dev_environment || exit 1
    
    # Source init script for AWS resource initialization
    source "${PROJECT_ROOT}/infrastructure/scripts/init.sh"
    initialize_aws_resources || exit 1
    setup_monitoring || exit 1
    
    # Validate setup
    validate_setup || exit 1
    
    echo "Setup completed successfully"
    echo "Logs available at: ${AUDIT_LOG}"
    exit 0
}

main "$@"