#!/bin/bash

# validate.sh - Infrastructure, Security, and Monitoring Configuration Validation Script
# Version: 1.0.0
# Dependencies:
# - terraform (v1.5+)
# - aws-cli (v2.0+)
# - jq (v1.6+)

set -euo pipefail

# Global constants
readonly EXIT_SUCCESS=0
readonly EXIT_FAILURE=1
readonly TERRAFORM_DIR="../"
readonly AWS_REGIONS=("us-east-1" "us-west-2")
readonly LOG_FILE="/var/log/infrastructure/validation.log"
readonly VALIDATION_REPORT="/tmp/validation_report.json"

# Logging setup
setup_logging() {
    local log_dir
    log_dir=$(dirname "${LOG_FILE}")
    mkdir -p "${log_dir}"
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting validation script"
}

# Logging decorator function
log_execution() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Executing: $1"
}

# Check required tools
check_prerequisites() {
    local missing_tools=()
    
    if ! command -v terraform >/dev/null 2>&1; then
        missing_tools+=("terraform (v1.5+)")
    fi
    
    if ! command -v aws >/dev/null 2>&1; then
        missing_tools+=("aws-cli (v2.0+)")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_tools+=("jq (v1.6+)")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        echo "ERROR: Missing required tools: ${missing_tools[*]}"
        return ${EXIT_FAILURE}
    fi
    
    return ${EXIT_SUCCESS}
}

# Validate Terraform configuration
validate_terraform_files() {
    local environment=$1
    log_execution "validate_terraform_files for ${environment}"
    
    # Change to Terraform directory
    cd "${TERRAFORM_DIR}/${environment}" || return ${EXIT_FAILURE}
    
    # Initialize Terraform
    if ! terraform init -backend=false > /dev/null; then
        echo "ERROR: Terraform initialization failed"
        return ${EXIT_FAILURE}
    fi
    
    # Validate Terraform configuration
    if ! terraform validate > /dev/null; then
        echo "ERROR: Terraform validation failed"
        return ${EXIT_FAILURE}
    }
    
    # Check required variables
    local required_vars=("project_name" "environment" "ecs_cluster_size")
    for var in "${required_vars[@]}"; do
        if ! grep -q "^${var}\s*=" terraform.tfvars 2>/dev/null; then
            echo "ERROR: Missing required variable: ${var}"
            return ${EXIT_FAILURE}
        fi
    done
    
    return ${EXIT_SUCCESS}
}

# Validate AWS configuration
validate_aws_config() {
    local environment=$1
    log_execution "validate_aws_config for ${environment}"
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        echo "ERROR: Invalid AWS credentials"
        return ${EXIT_FAILURE}
    }
    
    # Check AWS regions
    for region in "${AWS_REGIONS[@]}"; do
        if ! aws ec2 describe-regions --region "${region}" >/dev/null 2>&1; then
            echo "ERROR: Invalid AWS region: ${region}"
            return ${EXIT_FAILURE}
        fi
    done
    
    # Validate VPC configuration
    if ! aws ec2 describe-vpcs --filters "Name=tag:Environment,Values=${environment}" >/dev/null 2>&1; then
        echo "ERROR: VPC validation failed for environment: ${environment}"
        return ${EXIT_FAILURE}
    }
    
    return ${EXIT_SUCCESS}
}

# Validate monitoring configuration
validate_monitoring_config() {
    local environment=$1
    log_execution "validate_monitoring_config for ${environment}"
    
    # Validate DataDog API key
    if [ -z "${DATADOG_API_KEY:-}" ]; then
        echo "ERROR: DataDog API key not set"
        return ${EXIT_FAILURE}
    }
    
    # Check monitoring configuration files
    local monitoring_config="${TERRAFORM_DIR}/${environment}/monitoring/variables.tf"
    if [ ! -f "${monitoring_config}" ]; then
        echo "ERROR: Missing monitoring configuration file"
        return ${EXIT_FAILURE}
    }
    
    return ${EXIT_SUCCESS}
}

# Validate security configuration
validate_security_config() {
    local environment=$1
    log_execution "validate_security_config for ${environment}"
    
    # Check WAF rules
    if ! aws wafv2 list-web-acls --scope REGIONAL >/dev/null 2>&1; then
        echo "ERROR: WAF configuration validation failed"
        return ${EXIT_FAILURE}
    }
    
    # Validate security groups
    if ! aws ec2 describe-security-groups --filters "Name=tag:Environment,Values=${environment}" >/dev/null 2>&1; then
        echo "ERROR: Security group validation failed"
        return ${EXIT_FAILURE}
    }
    
    # Check encryption settings
    if ! aws kms list-keys >/dev/null 2>&1; then
        echo "ERROR: KMS configuration validation failed"
        return ${EXIT_FAILURE}
    }
    
    return ${EXIT_SUCCESS}
}

# Generate validation report
generate_report() {
    local environment=$1
    local terraform_status=$2
    local aws_status=$3
    local monitoring_status=$4
    local security_status=$5
    
    cat > "${VALIDATION_REPORT}" << EOF
{
    "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "environment": "${environment}",
    "validation_results": {
        "terraform": ${terraform_status},
        "aws": ${aws_status},
        "monitoring": ${monitoring_status},
        "security": ${security_status}
    }
}
EOF
}

# Main function
main() {
    local environment=${ENVIRONMENT:-"dev"}
    local exit_code=${EXIT_SUCCESS}
    
    # Setup logging
    setup_logging
    
    # Check prerequisites
    if ! check_prerequisites; then
        exit ${EXIT_FAILURE}
    }
    
    # Validate environment value
    case "${environment}" in
        dev|staging|prod) ;;
        *)
            echo "ERROR: Invalid environment. Must be one of: dev, staging, prod"
            exit ${EXIT_FAILURE}
            ;;
    esac
    
    # Run validations
    local terraform_status=${EXIT_SUCCESS}
    local aws_status=${EXIT_SUCCESS}
    local monitoring_status=${EXIT_SUCCESS}
    local security_status=${EXIT_SUCCESS}
    
    validate_terraform_files "${environment}" || terraform_status=${EXIT_FAILURE}
    validate_aws_config "${environment}" || aws_status=${EXIT_FAILURE}
    validate_monitoring_config "${environment}" || monitoring_status=${EXIT_FAILURE}
    validate_security_config "${environment}" || security_status=${EXIT_FAILURE}
    
    # Generate validation report
    generate_report "${environment}" "${terraform_status}" "${aws_status}" \
                   "${monitoring_status}" "${security_status}"
    
    # Set final exit code
    if [ "${terraform_status}" -ne ${EXIT_SUCCESS} ] || \
       [ "${aws_status}" -ne ${EXIT_SUCCESS} ] || \
       [ "${monitoring_status}" -ne ${EXIT_SUCCESS} ] || \
       [ "${security_status}" -ne ${EXIT_SUCCESS} ]; then
        exit_code=${EXIT_FAILURE}
    fi
    
    echo "Validation complete. Report generated at: ${VALIDATION_REPORT}"
    exit ${exit_code}
}

# Execute main function
main "$@"