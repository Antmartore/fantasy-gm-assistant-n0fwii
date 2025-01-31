#!/bin/bash

# Fantasy Sports GM Assistant Deployment Script
# Version: 1.0.0
# Dependencies:
# - aws-cli >= 2.0
# - jq >= 1.6
# - docker >= 24.0

set -euo pipefail

# Source environment initialization
source "$(dirname "$0")/init.sh"

# Global variables
readonly AWS_REGION="${AWS_REGION:-us-west-1}"
readonly ENVIRONMENT="${ENVIRONMENT:-dev}"
readonly PROJECT_NAME="${PROJECT_NAME:-fantasy-gm-assistant}"
readonly DEPLOYMENT_TIMEOUT="${DEPLOYMENT_TIMEOUT:-300}"
readonly HEALTH_CHECK_RETRIES="${HEALTH_CHECK_RETRIES:-5}"
readonly LOG_LEVEL="${LOG_LEVEL:-INFO}"
readonly ENABLE_CANARY="${ENABLE_CANARY:-false}"
readonly SECURITY_SCAN_ENABLED="${SECURITY_SCAN_ENABLED:-true}"
readonly PERFORMANCE_CHECK_ENABLED="${PERFORMANCE_CHECK_ENABLED:-true}"
readonly METRIC_NAMESPACE="FantasyGM/Deployment"

# Logging configuration
log() {
    local level="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${level}] ${message}"
}

# Error handling
error_handler() {
    local exit_code=$?
    local line_number=$1
    log "ERROR" "Failed at line ${line_number} with exit code ${exit_code}"
    
    # Send metric for failed deployment
    aws cloudwatch put-metric-data \
        --namespace "${METRIC_NAMESPACE}" \
        --metric-name "DeploymentFailure" \
        --value 1 \
        --dimensions Environment="${ENVIRONMENT}"
    
    # Initiate rollback
    rollback_deployment
    exit "${exit_code}"
}
trap 'error_handler ${LINENO}' ERR

# Cleanup function
cleanup() {
    log "INFO" "Performing deployment cleanup..."
    
    # Remove temporary files
    rm -f /tmp/fantasy-gm-*.json
    
    # Cleanup old task definitions
    cleanup_task_definitions
    
    # Remove unused target groups
    cleanup_target_groups
}
trap cleanup EXIT

# Validate environment and prerequisites
validate_environment() {
    log "INFO" "Validating deployment environment..."
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &>/dev/null; then
        log "ERROR" "Invalid AWS credentials"
        return 1
    }
    
    # Validate ECS cluster existence
    if ! aws ecs describe-clusters \
        --clusters "${PROJECT_NAME}-${ENVIRONMENT}" \
        --query 'clusters[0].status' \
        --output text | grep -q "ACTIVE"; then
        log "ERROR" "ECS cluster not found or not active"
        return 1
    }
    
    # Check required permissions
    check_prerequisites
    
    return 0
}

# Deploy new task definition
deploy_service() {
    local service_name="$1"
    log "INFO" "Deploying service: ${service_name}"
    
    # Register new task definition
    local task_def_arn
    task_def_arn=$(aws ecs register-task-definition \
        --cli-input-json "file:///tmp/fantasy-gm-${service_name}-taskdef.json" \
        --query 'taskDefinition.taskDefinitionArn' \
        --output text)
    
    # Create new target group
    local target_group_arn
    target_group_arn=$(create_target_group "${service_name}")
    
    # Update service with new task definition
    aws ecs update-service \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}" \
        --service "${service_name}" \
        --task-definition "${task_def_arn}" \
        --force-new-deployment \
        --health-check-grace-period-seconds 60
    
    # Monitor deployment
    monitor_deployment "${service_name}" "${task_def_arn}"
}

# Create new target group for blue-green deployment
create_target_group() {
    local service_name="$1"
    local timestamp
    timestamp=$(date +%s)
    
    aws elbv2 create-target-group \
        --name "${service_name}-${timestamp}" \
        --protocol HTTP \
        --port 80 \
        --vpc-id "${VPC_ID}" \
        --health-check-path "/health" \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 5 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 3 \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text
}

# Monitor deployment progress
monitor_deployment() {
    local service_name="$1"
    local task_def_arn="$2"
    local start_time
    start_time=$(date +%s)
    
    while true; do
        # Check deployment status
        local deployment_status
        deployment_status=$(aws ecs describe-services \
            --cluster "${PROJECT_NAME}-${ENVIRONMENT}" \
            --services "${service_name}" \
            --query 'services[0].deployments[0].status' \
            --output text)
        
        # Check timeout
        local current_time
        current_time=$(date +%s)
        if (( current_time - start_time > DEPLOYMENT_TIMEOUT )); then
            log "ERROR" "Deployment timeout exceeded"
            return 1
        fi
        
        case "${deployment_status}" in
            "PRIMARY")
                if verify_service_health "${service_name}"; then
                    log "INFO" "Deployment completed successfully"
                    return 0
                fi
                ;;
            "FAILED")
                log "ERROR" "Deployment failed"
                return 1
                ;;
        esac
        
        sleep 10
    done
}

# Verify service health
verify_service_health() {
    local service_name="$1"
    local retries="${HEALTH_CHECK_RETRIES}"
    
    while (( retries > 0 )); do
        # Check service health endpoint
        if curl -sf "http://${service_name}.${PROJECT_NAME}-${ENVIRONMENT}.local/health"; then
            return 0
        fi
        
        (( retries-- ))
        sleep 5
    done
    
    return 1
}

# Rollback deployment
rollback_deployment() {
    log "WARNING" "Initiating deployment rollback..."
    
    # Get previous task definition
    local previous_task_def
    previous_task_def=$(aws ecs describe-services \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}" \
        --services "${service_name}" \
        --query 'services[0].taskDefinition' \
        --output text)
    
    # Rollback to previous task definition
    aws ecs update-service \
        --cluster "${PROJECT_NAME}-${ENVIRONMENT}" \
        --service "${service_name}" \
        --task-definition "${previous_task_def}" \
        --force-new-deployment
    
    log "INFO" "Rollback completed"
}

# Cleanup old task definitions
cleanup_task_definitions() {
    log "INFO" "Cleaning up old task definitions..."
    
    local task_definitions
    task_definitions=$(aws ecs list-task-definitions \
        --family-prefix "${PROJECT_NAME}" \
        --status INACTIVE \
        --query 'taskDefinitionArns[]' \
        --output text)
    
    for task_def in ${task_definitions}; do
        aws ecs deregister-task-definition \
            --task-definition "${task_def}" \
            --query 'taskDefinition.taskDefinitionArn' \
            --output text
    done
}

# Main deployment function
main() {
    log "INFO" "Starting deployment for environment: ${ENVIRONMENT}"
    
    # Validate environment
    validate_environment || exit 1
    
    # Deploy API service
    deploy_service "api"
    
    # Deploy worker service
    deploy_service "worker"
    
    # Record successful deployment metric
    aws cloudwatch put-metric-data \
        --namespace "${METRIC_NAMESPACE}" \
        --metric-name "DeploymentSuccess" \
        --value 1 \
        --dimensions Environment="${ENVIRONMENT}"
    
    log "INFO" "Deployment completed successfully"
}

# Execute main function
main "$@"