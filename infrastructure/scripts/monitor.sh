#!/bin/bash

# Fantasy Sports GM Assistant - System Monitoring Script
# Version: 1.0.0
# Dependencies:
# - jq v1.6
# - curl v7.0+
# - aws-cli v2.0+

set -euo pipefail

# Constants and Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_DIR="/var/log/fantasy-gm"
readonly MONITOR_INTERVAL=60
readonly METRICS_RETENTION=90

# Alert Thresholds
declare -A ALERT_THRESHOLDS=(
    ["CPU_CRITICAL"]=90
    ["CPU_WARNING"]=75
    ["MEMORY_CRITICAL"]=85
    ["MEMORY_WARNING"]=70
    ["DISK_CRITICAL"]=90
    ["DISK_WARNING"]=80
    ["API_LATENCY_CRITICAL"]=2000
    ["API_LATENCY_WARNING"]=1000
    ["ERROR_RATE_CRITICAL"]=5
    ["ERROR_RATE_WARNING"]=2
    ["CACHE_MISS_CRITICAL"]=40
    ["CACHE_MISS_WARNING"]=25
    ["DB_CONN_CRITICAL"]=80
    ["DB_CONN_WARNING"]=60
)

# Alert Configuration
declare -A ALERT_POLICIES=(
    ["ESCALATION_TIMEOUT"]=300
    ["RETRY_INTERVAL"]=60
    ["MAX_RETRIES"]=3
    ["DEDUP_WINDOW"]=300
)

# Initialize logging
setup_logging() {
    mkdir -p "${LOG_DIR}"
    exec 1> >(tee -a "${LOG_DIR}/monitor.log")
    exec 2> >(tee -a "${LOG_DIR}/monitor.error.log")
    
    # Rotate logs older than METRICS_RETENTION days
    find "${LOG_DIR}" -type f -mtime +${METRICS_RETENTION} -delete
}

# System Health Check
check_system_health() {
    local zone="$1"
    local service_name="$2"
    local timestamp=$(date +%s)
    
    # CPU Usage (overall and per-core)
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}')
    local cpu_per_core=$(mpstat -P ALL 1 1 | awk '/Average:/ && $2 ~ /[0-9]/ {print $2":"$3}')
    
    # Memory Usage
    local memory_info=$(free -m | grep Mem)
    local memory_total=$(echo "$memory_info" | awk '{print $2}')
    local memory_used=$(echo "$memory_info" | awk '{print $3}')
    local memory_usage=$((memory_used * 100 / memory_total))
    
    # Disk Usage
    local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    # Process Check
    local process_count=$(ps aux | wc -l)
    
    # Generate health report
    local health_report=$(jq -n \
        --arg timestamp "$timestamp" \
        --arg zone "$zone" \
        --arg service "$service_name" \
        --arg cpu "$cpu_usage" \
        --arg mem "$memory_usage" \
        --arg disk "$disk_usage" \
        --arg procs "$process_count" \
        '{
            timestamp: $timestamp,
            zone: $zone,
            service: $service,
            metrics: {
                cpu_usage: $cpu|tonumber,
                memory_usage: $mem|tonumber,
                disk_usage: $disk|tonumber,
                process_count: $procs|tonumber
            }
        }')
    
    echo "$health_report"
}

# API Performance Monitoring
monitor_api_performance() {
    local endpoint_group="$1"
    local time_window="$2"
    
    # Calculate API latency percentiles
    local api_metrics=$(curl -s -X GET \
        -H "DD-API-KEY: ${DATADOG_API_KEY}" \
        "https://api.datadoghq.com/api/v1/query?query=avg:fantasy_gm.api.response_time{*}")
    
    # Error rate monitoring
    local error_rate=$(curl -s -X GET \
        -H "DD-API-KEY: ${DATADOG_API_KEY}" \
        "https://api.datadoghq.com/api/v1/query?query=sum:fantasy_gm.errors.count{*}")
    
    # Generate performance report
    local perf_report=$(jq -n \
        --argjson metrics "$api_metrics" \
        --argjson errors "$error_rate" \
        '{
            api_performance: $metrics,
            error_metrics: $errors
        }')
    
    echo "$perf_report"
}

# Database Health Monitoring
monitor_database_health() {
    local database_type="$1"
    local instance_id="$2"
    
    # Database connection monitoring
    local connection_metrics=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS \
        --metric-name DatabaseConnections \
        --dimensions Name=DBInstanceIdentifier,Value="$instance_id" \
        --start-time "$(date -u -v-5M '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period 300 \
        --statistics Average)
    
    # Query performance monitoring
    local slow_query_metrics=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS \
        --metric-name SlowQueries \
        --dimensions Name=DBInstanceIdentifier,Value="$instance_id" \
        --start-time "$(date -u -v-5M '+%Y-%m-%dT%H:%M:%SZ')" \
        --end-time "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" \
        --period 300 \
        --statistics Sum)
    
    # Generate database health report
    local db_report=$(jq -n \
        --argjson connections "$connection_metrics" \
        --argjson slow_queries "$slow_query_metrics" \
        '{
            connections: $connections,
            slow_queries: $slow_queries
        }')
    
    echo "$db_report"
}

# Alert Generation
generate_alerts() {
    local alert_type="$1"
    local severity="$2"
    local alert_data="$3"
    
    # Check deduplication window
    local dedup_key="${alert_type}_${severity}"
    local last_alert_time=$(redis-cli get "alert:${dedup_key}")
    local current_time=$(date +%s)
    
    if [ -n "$last_alert_time" ] && [ $((current_time - last_alert_time)) -lt "${ALERT_POLICIES[DEDUP_WINDOW]}" ]; then
        return 0
    fi
    
    # Format alert message
    local alert_message=$(jq -n \
        --arg type "$alert_type" \
        --arg severity "$severity" \
        --argjson data "$alert_data" \
        '{
            type: $type,
            severity: $severity,
            timestamp: now,
            data: $data
        }')
    
    # Send alert to Datadog
    curl -X POST "https://api.datadoghq.com/api/v1/events" \
        -H "DD-API-KEY: ${DATADOG_API_KEY}" \
        -H "Content-Type: application/json" \
        -d "$alert_message"
    
    # Update deduplication window
    redis-cli setex "alert:${dedup_key}" "${ALERT_POLICIES[DEDUP_WINDOW]}" "$current_time"
}

# Main monitoring loop
main() {
    setup_logging
    
    echo "Starting Fantasy Sports GM Assistant monitoring script..."
    
    while true; do
        # System health monitoring
        local health_data=$(check_system_health "us-west-2" "fantasy-gm")
        
        # API performance monitoring
        local api_data=$(monitor_api_performance "all" "5m")
        
        # Database health monitoring
        local db_data=$(monitor_database_health "aurora-postgresql" "fantasy-gm-db")
        
        # Process metrics and generate alerts
        if [ "$(echo "$health_data" | jq '.metrics.cpu_usage')" -gt "${ALERT_THRESHOLDS[CPU_CRITICAL]}" ]; then
            generate_alerts "cpu_usage" "critical" "$health_data"
        fi
        
        if [ "$(echo "$health_data" | jq '.metrics.memory_usage')" -gt "${ALERT_THRESHOLDS[MEMORY_CRITICAL]}" ]; then
            generate_alerts "memory_usage" "critical" "$health_data"
        fi
        
        if [ "$(echo "$api_data" | jq '.api_performance.response_time')" -gt "${ALERT_THRESHOLDS[API_LATENCY_CRITICAL]}" ]; then
            generate_alerts "api_latency" "critical" "$api_data"
        fi
        
        # Export metrics to Prometheus
        echo "$health_data" | curl -X POST \
            "http://localhost:9090/metrics/job/fantasy-gm" \
            --data-binary @-
        
        sleep "$MONITOR_INTERVAL"
    done
}

# Start monitoring if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi