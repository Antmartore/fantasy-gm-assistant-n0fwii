#!/bin/bash
# Fantasy GM Assistant - Automated Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.0+
# - postgresql-client v15.0+
# - pigz v2.4+
# - jq v1.6+

set -euo pipefail
IFS=$'\n\t'

# Global Variables
BACKUP_ROOT="/tmp/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
S3_BUCKET="${PROJECT_NAME:-fantasy-gm}-${ENVIRONMENT:-prod}-backups"
DB_HOST="${DB_ENDPOINT:-localhost}"
DB_NAME="fantasy_gm"
KMS_KEY_ID="${KMS_KEY_ID}"
RETENTION_DAYS=30
PARALLEL_JOBS=4
LOG_FILE="/var/log/fantasy_gm/backups.log"
METRIC_NAMESPACE="FantasyGM/Backups"

# Logging setup
setup_logging() {
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] Starting backup process"
}

# Error handling
error_handler() {
    local exit_code=$?
    local line_number=$1
    echo "[ERROR] Failed at line ${line_number} with exit code ${exit_code}"
    cleanup_on_error
    aws cloudwatch put-metric-data --namespace "${METRIC_NAMESPACE}" \
        --metric-name BackupFailure --value 1 --unit Count
    exit "${exit_code}"
}
trap 'error_handler ${LINENO}' ERR

# Initialize backup environment
initialize_backup() {
    echo "[INFO] Initializing backup environment"
    
    # Verify AWS credentials
    aws sts get-caller-identity > /dev/null || {
        echo "[ERROR] AWS credentials not configured"
        exit 1
    }
    
    # Verify KMS key
    aws kms describe-key --key-id "${KMS_KEY_ID}" > /dev/null || {
        echo "[ERROR] KMS key not accessible"
        exit 1
    }
    
    # Initialize CloudWatch metric
    aws cloudwatch put-metric-data --namespace "${METRIC_NAMESPACE}" \
        --metric-name BackupStart --value 1 --unit Count
}

# Setup backup directories
setup_backup_dirs() {
    echo "[INFO] Setting up backup directories"
    
    # Create and secure backup directories
    mkdir -p "${BACKUP_ROOT}"/{db,media,config}
    chmod 700 "${BACKUP_ROOT}"
    
    # Create working directories
    WORK_DIR="${BACKUP_ROOT}/work_${TIMESTAMP}"
    mkdir -p "${WORK_DIR}"
    
    # Set secure permissions
    find "${BACKUP_ROOT}" -type d -exec chmod 700 {} \;
}

# Database backup function
backup_database() {
    echo "[INFO] Starting database backup"
    local db_backup_file="${WORK_DIR}/db_${TIMESTAMP}.sql.gz"
    
    # Create database backup with compression
    PGPASSWORD="${DB_PASSWORD}" pg_dump -h "${DB_HOST}" -U "${DB_USER}" \
        -d "${DB_NAME}" -F c | pigz -p "${PARALLEL_JOBS}" > "${db_backup_file}"
    
    # Encrypt backup
    aws kms encrypt --key-id "${KMS_KEY_ID}" --input-file "${db_backup_file}" \
        --output-file "${db_backup_file}.enc"
    
    # Generate checksum
    sha256sum "${db_backup_file}.enc" > "${db_backup_file}.enc.sha256"
    
    echo "[INFO] Database backup completed"
    return 0
}

# Media backup function
backup_media() {
    echo "[INFO] Starting media backup"
    local media_backup_dir="${WORK_DIR}/media"
    mkdir -p "${media_backup_dir}"
    
    # Sync media from S3
    aws s3 sync "s3://${S3_BUCKET}/media" "${media_backup_dir}" \
        --only-show-errors
    
    # Create parallel compressed archives
    find "${media_backup_dir}" -type f -print0 | \
        xargs -0 -P "${PARALLEL_JOBS}" -I {} tar czf {}.tar.gz {}
    
    # Encrypt archives
    find "${media_backup_dir}" -name "*.tar.gz" -print0 | \
        xargs -0 -P "${PARALLEL_JOBS}" -I {} \
        aws kms encrypt --key-id "${KMS_KEY_ID}" --input-file {} \
        --output-file {}.enc
    
    echo "[INFO] Media backup completed"
    return 0
}

# Upload backup to S3
upload_backup() {
    echo "[INFO] Uploading backups to S3"
    
    # Upload database backup
    aws s3 cp "${WORK_DIR}/db_${TIMESTAMP}.sql.gz.enc" \
        "s3://${S3_BUCKET}/backups/${TIMESTAMP}/db/" \
        --only-show-errors
    
    # Upload media backups
    aws s3 sync "${WORK_DIR}/media" \
        "s3://${S3_BUCKET}/backups/${TIMESTAMP}/media/" \
        --only-show-errors \
        --exclude "*" --include "*.enc"
    
    # Set lifecycle policy
    aws s3api put-object-tagging --bucket "${S3_BUCKET}" \
        --key "backups/${TIMESTAMP}" \
        --tagging "TagSet=[{Key=retention,Value=${RETENTION_DAYS}}]"
    
    echo "[INFO] Upload completed"
    return 0
}

# Cleanup function
cleanup() {
    echo "[INFO] Starting cleanup"
    
    # Remove temporary files
    rm -rf "${WORK_DIR}"
    
    # Update CloudWatch metrics
    aws cloudwatch put-metric-data --namespace "${METRIC_NAMESPACE}" \
        --metric-name BackupSuccess --value 1 --unit Count
    
    echo "[INFO] Cleanup completed"
    return 0
}

# Cleanup on error
cleanup_on_error() {
    echo "[ERROR] Cleaning up after failure"
    rm -rf "${WORK_DIR}"
}

# Main backup orchestration
main() {
    local start_time=$(date +%s)
    
    setup_logging
    initialize_backup
    setup_backup_dirs
    
    # Execute backups
    backup_database
    backup_media
    upload_backup
    
    # Calculate backup duration
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    # Record backup duration metric
    aws cloudwatch put-metric-data --namespace "${METRIC_NAMESPACE}" \
        --metric-name BackupDuration --value "${duration}" --unit Seconds
    
    cleanup
    
    echo "[INFO] Backup completed successfully in ${duration} seconds"
    return 0
}

# Execute main function
main "$@"