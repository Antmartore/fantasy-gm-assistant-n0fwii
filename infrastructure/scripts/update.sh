#!/bin/bash

# Fantasy Sports GM Assistant Infrastructure Update Script
# Version: 1.0.0
# Dependencies:
# - aws-cli >= 2.0
# - terraform >= 1.5
# - jq >= 1.6
# - trivy >= 0.45

set -euo pipefail

# Source validation and deployment functions
source "$(dirname "$0")/validate.sh"
source "$(dirname "$0")/deploy.sh"

# Global variables
readonly AWS_REGION="${AWS_REGION:-us-west-2}"
readonly ENVIRONMENT="${ENVIRONMENT:-dev}"
readonly PROJECT_NAME="${PROJECT_NAME:-fantasy-gm-assistant}"
readonly UPDATE_TIMEOUT="${UPDATE_TIMEOUT:-600}"
readonly TERRAFORM_DIR="../aws"
readonly BACKUP_RETENTION="${BACKUP_RETENTION:-7}"
readonly MAX_RETRY_ATTEMPTS="${MAX_RETRY_ATTEMPTS:-3}"
readonly HEALTH_CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-30}"
readonly LOG_FILE="/var/log/infrastructure/updates.log"
readonly METRIC_NAMESPACE="FantasyGM/Updates"

# Logging configuration
setup_logging() {
    local log_dir
    log_dir=$(dirname "${LOG_FILE}")
    mkdir -p "${log_dir}"
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting infrastructure update process"
}

# Error handling
error_handler() {
    local exit_code=$?
    local line_number=$1
    echo "[ERROR] Failed at line ${line_number} with exit code ${exit_code}"
    
    # Send metric for failed update
    aws cloudwatch put-metric-data \
        --namespace "${METRIC_NAMESPACE}" \
        --metric-name "UpdateFailure" \
        --value 1 \
        --dimensions Environment="${ENVIRONMENT}"
    
    # Initiate rollback
    rollback_updates "infrastructure" "$(get_previous_state)"
    exit "${exit_code}"
}
trap 'error_handler ${LINENO}' ERR

# Cleanup function
cleanup_on_error() {
    echo "Performing update cleanup..."
    
    # Remove temporary files
    rm -f /tmp/fantasy-gm-*.json
    rm -f /tmp/fantasy-gm-*.backup
    
    # Restore previous state if needed
    if [ -f "/tmp/fantasy-gm-previous-state.json" ]; then
        rollback_updates "infrastructure" "$(cat /tmp/fantasy-gm-previous-state.json)"
    fi
}
trap cleanup_on_error EXIT

# Check prerequisites
check_prerequisites() {
    echo "Checking update prerequisites..."
    
    # Validate required tools
    local missing_tools=()
    
    if ! command -v aws >/dev/null 2>&1; then
        missing_tools+=("aws-cli (v2.0+)")
    fi
    
    if ! command -v terraform >/dev/null 2>&1; then
        missing_tools+=("terraform (v1.5+)")
    fi
    
    if ! command -v jq >/dev/null 2>&1; then
        missing_tools+=("jq (v1.6+)")
    fi
    
    if ! command -v trivy >/dev/null 2>&1; then
        missing_tools+=("trivy (v0.45+)")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        echo "ERROR: Missing required tools: ${missing_tools[*]}"
        return 1
    fi
    
    # Validate AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        echo "ERROR: Invalid AWS credentials"
        return 1
    fi
    
    # Validate environment
    case "${ENVIRONMENT}" in
        dev|staging|prod) ;;
        *)
            echo "ERROR: Invalid environment. Must be one of: dev, staging, prod"
            return 1
            ;;
    esac
    
    return 0
}

# Update infrastructure
update_infrastructure() {
    local environment="$1"
    local backup_id="$2"
    echo "Updating infrastructure for environment: ${environment}"
    
    # Create infrastructure state backup
    aws s3 cp \
        "s3://fantasy-gm-terraform-${environment}/terraform.tfstate" \
        "/tmp/fantasy-gm-tfstate-${backup_id}.backup"
    
    # Initialize Terraform
    cd "${TERRAFORM_DIR}"
    terraform init -backend=true
    
    # Validate Terraform configurations
    if ! terraform validate; then
        echo "ERROR: Terraform validation failed"
        return 1
    fi
    
    # Generate and validate plan
    terraform plan -out="/tmp/fantasy-gm-plan-${backup_id}.tfplan"
    
    # Apply infrastructure updates
    if ! terraform apply -auto-approve "/tmp/fantasy-gm-plan-${backup_id}.tfplan"; then
        echo "ERROR: Terraform apply failed"
        return 1
    fi
    
    return 0
}

# Update container images
update_container_images() {
    local service_name="$1"
    local image_version="$2"
    local deployment_config="$3"
    echo "Updating container images for service: ${service_name}"
    
    # Perform security scan
    if ! trivy image "${service_name}:${image_version}"; then
        echo "ERROR: Security scan failed for ${service_name}:${image_version}"
        return 1
    fi
    
    # Update task definition
    local task_def_arn
    task_def_arn=$(update_task_definition "${service_name}" "${image_version}")
    
    # Deploy service with blue-green deployment
    if ! blue_green_deployment "${service_name}" "${task_def_arn}" "${deployment_config}"; then
        echo "ERROR: Service deployment failed"
        return 1
    fi
    
    return 0
}

# Update configurations
update_configurations() {
    local config_type="$1"
    local config_changes="$2"
    local force_update="$3"
    echo "Updating configurations: ${config_type}"
    
    # Backup current configurations
    aws s3 cp \
        "s3://fantasy-gm-configs-${ENVIRONMENT}/${config_type}.json" \
        "/tmp/fantasy-gm-config-${config_type}.backup"
    
    # Apply configuration changes
    if ! aws s3 cp \
        <(echo "${config_changes}") \
        "s3://fantasy-gm-configs-${ENVIRONMENT}/${config_type}.json"; then
        echo "ERROR: Failed to update configurations"
        return 1
    fi
    
    return 0
}

# Rollback updates
rollback_updates() {
    local update_type="$1"
    local previous_state="$2"
    local rollback_options="$3"
    echo "Rolling back updates: ${update_type}"
    
    case "${update_type}" in
        "infrastructure")
            # Restore Terraform state
            aws s3 cp \
                "/tmp/fantasy-gm-tfstate-${previous_state}.backup" \
                "s3://fantasy-gm-terraform-${ENVIRONMENT}/terraform.tfstate"
            terraform apply -auto-approve
            ;;
        "container")
            # Rollback to previous task definition
            aws ecs update-service \
                --cluster "${PROJECT_NAME}-${ENVIRONMENT}" \
                --service "${rollback_options}" \
                --task-definition "${previous_state}" \
                --force-new-deployment
            ;;
        "config")
            # Restore previous configuration
            aws s3 cp \
                "/tmp/fantasy-gm-config-${previous_state}.backup" \
                "s3://fantasy-gm-configs-${ENVIRONMENT}/${rollback_options}"
            ;;
    esac
}

# Main function
main() {
    local backup_id
    backup_id=$(date +%Y%m%d%H%M%S)
    
    setup_logging
    
    # Check prerequisites
    if ! check_prerequisites; then
        exit 1
    fi
    
    # Validate environment
    if ! validate_terraform_configs && \
       ! validate_aws_prerequisites && \
       ! validate_network_connectivity; then
        echo "ERROR: Environment validation failed"
        exit 1
    fi
    
    # Update infrastructure
    if ! update_infrastructure "${ENVIRONMENT}" "${backup_id}"; then
        exit 1
    fi
    
    # Update container images
    if ! update_container_images "api" "latest" '{"min_healthy_percent": 100}'; then
        exit 1
    fi
    
    if ! update_container_images "worker" "latest" '{"min_healthy_percent": 50}'; then
        exit 1
    fi
    
    # Update configurations
    if ! update_configurations "app" '{"version": "1.0.1"}' false; then
        exit 1
    fi
    
    echo "Infrastructure update completed successfully"
    exit 0
}

# Execute main function
main "$@"