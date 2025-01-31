#!/bin/bash

# Fantasy Sports GM Assistant - ECS Service Scaling Script
# Version: 1.0.0
# Dependencies: aws-cli >= 2.0, jq >= 1.6

set -euo pipefail
IFS=$'\n\t'

# Global variables from infrastructure configuration
AWS_REGION=$(aws configure get region)
CLUSTER_NAME="${project_name}-${environment}"
API_SERVICE_MIN_TASKS=2
API_SERVICE_MAX_TASKS=10
WORKER_SERVICE_MIN_TASKS=1
WORKER_SERVICE_MAX_TASKS=5
CPU_THRESHOLD_HIGH=70
CPU_THRESHOLD_LOW=30
MEMORY_THRESHOLD_HIGH=80
MEMORY_THRESHOLD_LOW=40
SCALING_COOLDOWN_SECONDS=300
CROSS_AZ_BALANCE_THRESHOLD=20
METRIC_COLLECTION_INTERVAL=60

# Logging configuration
LOG_FILE="/var/log/fantasy-gm/ecs-scaling.log"
SCRIPT_NAME=$(basename "$0")

# Logging function with timestamp and log levels
log() {
    local level=$1
    shift
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $SCRIPT_NAME: $*" | tee -a "$LOG_FILE"
}

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites..."

    # Check AWS CLI version
    if ! aws --version | grep -q "aws-cli/2"; then
        log "ERROR" "AWS CLI version 2.0 or higher is required"
        return 1
    fi

    # Check jq installation
    if ! command -v jq >/dev/null 2>&1; then
        log "ERROR" "jq is required but not installed"
        return 1
    fi

    # Verify AWS credentials
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
        log "ERROR" "Invalid or expired AWS credentials"
        return 1
    }

    # Check ECS cluster existence
    if ! aws ecs describe-clusters --clusters "$CLUSTER_NAME" --region "$AWS_REGION" >/dev/null 2>&1; then
        log "ERROR" "ECS cluster $CLUSTER_NAME not found"
        return 1
    }

    log "INFO" "Prerequisites check passed"
    return 0
}

# Function to get service metrics
get_service_metrics() {
    local service_name=$1
    local period=${2:-300} # 5 minutes default

    log "INFO" "Collecting metrics for service $service_name"

    # Get CPU utilization
    local cpu_utilization=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ECS \
        --metric-name CPUUtilization \
        --dimensions Name=ClusterName,Value="$CLUSTER_NAME" Name=ServiceName,Value="$service_name" \
        --start-time "$(date -u -v-${period}S '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period "$period" \
        --statistics Average \
        --region "$AWS_REGION" \
        --output json | jq -r '.Datapoints[0].Average // 0')

    # Get memory utilization
    local memory_utilization=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ECS \
        --metric-name MemoryUtilization \
        --dimensions Name=ClusterName,Value="$CLUSTER_NAME" Name=ServiceName,Value="$service_name" \
        --start-time "$(date -u -v-${period}S '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period "$period" \
        --statistics Average \
        --region "$AWS_REGION" \
        --output json | jq -r '.Datapoints[0].Average // 0')

    # Get current task count
    local running_count=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$service_name" \
        --region "$AWS_REGION" \
        --output json | jq -r '.services[0].runningCount')

    echo "{\"cpu\": $cpu_utilization, \"memory\": $memory_utilization, \"tasks\": $running_count}"
}

# Function to check AZ balance
check_az_balance() {
    local service_name=$1
    
    log "INFO" "Checking AZ balance for service $service_name"

    # Get task distribution across AZs
    local tasks_by_az=$(aws ecs list-tasks \
        --cluster "$CLUSTER_NAME" \
        --service-name "$service_name" \
        --region "$AWS_REGION" \
        --output json | jq -r '.taskArns[]' | while read -r task_arn; do
            aws ecs describe-tasks \
                --cluster "$CLUSTER_NAME" \
                --tasks "$task_arn" \
                --region "$AWS_REGION" \
                --output json | jq -r '.tasks[0].availabilityZone'
        done | sort | uniq -c)

    # Calculate imbalance percentage
    local max_tasks=$(echo "$tasks_by_az" | awk '{print $1}' | sort -nr | head -1)
    local min_tasks=$(echo "$tasks_by_az" | awk '{print $1}' | sort -n | head -1)
    local imbalance=$(( (max_tasks - min_tasks) * 100 / max_tasks ))

    echo "$imbalance"
}

# Function to scale service
scale_service() {
    local service_name=$1
    local desired_count=$2
    local min_tasks=$3
    local max_tasks=$4

    log "INFO" "Scaling service $service_name to $desired_count tasks"

    # Validate desired count against limits
    if [ "$desired_count" -lt "$min_tasks" ]; then
        desired_count=$min_tasks
        log "WARN" "Desired count adjusted to minimum: $min_tasks"
    elif [ "$desired_count" -gt "$max_tasks" ]; then
        desired_count=$max_tasks
        log "WARN" "Desired count adjusted to maximum: $max_tasks"
    fi

    # Check cooldown period
    local last_scale_time
    last_scale_time=$(aws ecs describe-services \
        --cluster "$CLUSTER_NAME" \
        --services "$service_name" \
        --region "$AWS_REGION" \
        --output json | jq -r '.services[0].deployments[0].updatedAt')

    local current_time=$(date +%s)
    local last_scale_seconds=$(date -d "$last_scale_time" +%s)
    local cooldown_elapsed=$((current_time - last_scale_seconds))

    if [ "$cooldown_elapsed" -lt "$SCALING_COOLDOWN_SECONDS" ]; then
        log "WARN" "Scaling cooldown period not elapsed. Skipping scale operation."
        return 0
    fi

    # Perform scaling operation
    aws ecs update-service \
        --cluster "$CLUSTER_NAME" \
        --service "$service_name" \
        --desired-count "$desired_count" \
        --region "$AWS_REGION" \
        --output json || {
            log "ERROR" "Failed to scale service $service_name"
            return 1
        }

    log "INFO" "Successfully scaled service $service_name to $desired_count tasks"
    return 0
}

# Main scaling logic
main() {
    local service_name=$1
    local service_type=$2

    log "INFO" "Starting scaling evaluation for $service_name ($service_type)"

    # Check prerequisites
    check_prerequisites || exit 1

    # Set scaling limits based on service type
    local min_tasks max_tasks
    if [ "$service_type" = "api" ]; then
        min_tasks=$API_SERVICE_MIN_TASKS
        max_tasks=$API_SERVICE_MAX_TASKS
    else
        min_tasks=$WORKER_SERVICE_MIN_TASKS
        max_tasks=$WORKER_SERVICE_MAX_TASKS
    fi

    # Get current metrics
    local metrics
    metrics=$(get_service_metrics "$service_name")
    local cpu_util=$(echo "$metrics" | jq -r '.cpu')
    local memory_util=$(echo "$metrics" | jq -r '.memory')
    local current_tasks=$(echo "$metrics" | jq -r '.tasks')

    log "INFO" "Current metrics - CPU: $cpu_util%, Memory: $memory_util%, Tasks: $current_tasks"

    # Calculate desired count based on metrics
    local desired_count=$current_tasks
    if [ "$(echo "$cpu_util > $CPU_THRESHOLD_HIGH" | bc)" -eq 1 ] || \
       [ "$(echo "$memory_util > $MEMORY_THRESHOLD_HIGH" | bc)" -eq 1 ]; then
        desired_count=$((current_tasks + 1))
        log "INFO" "Scale up triggered by high resource utilization"
    elif [ "$(echo "$cpu_util < $CPU_THRESHOLD_LOW" | bc)" -eq 1 ] && \
         [ "$(echo "$memory_util < $MEMORY_THRESHOLD_LOW" | bc)" -eq 1 ]; then
        desired_count=$((current_tasks - 1))
        log "INFO" "Scale down triggered by low resource utilization"
    fi

    # Check AZ balance if scaling down
    if [ "$desired_count" -lt "$current_tasks" ]; then
        local az_imbalance
        az_imbalance=$(check_az_balance "$service_name")
        if [ "$az_imbalance" -gt "$CROSS_AZ_BALANCE_THRESHOLD" ]; then
            log "WARN" "AZ imbalance detected ($az_imbalance%). Maintaining current task count."
            desired_count=$current_tasks
        fi
    fi

    # Perform scaling if needed
    if [ "$desired_count" -ne "$current_tasks" ]; then
        scale_service "$service_name" "$desired_count" "$min_tasks" "$max_tasks"
    else
        log "INFO" "No scaling action required"
    fi
}

# Script entry point
if [ "$#" -ne 2 ]; then
    log "ERROR" "Usage: $0 <service_name> <service_type>"
    exit 1
fi

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

# Execute main function
main "$1" "$2"