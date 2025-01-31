#!/usr/bin/env bash

# Fantasy GM Assistant - Database Migration Script
# Version: 1.0.0
# Requires: PostgreSQL 15+, Alembic 1.5+, AWS CLI 2.0+

set -euo pipefail
IFS=$'\n\t'

# Global variables
readonly PROJECT_ROOT=$(pwd)/../..
readonly ENVIRONMENT=${1:-dev}
readonly BACKEND_DIR=${PROJECT_ROOT}/src/backend
readonly MIGRATIONS_DIR=${BACKEND_DIR}/migrations
readonly BACKUP_DIR=${PROJECT_ROOT}/backups/${ENVIRONMENT}
readonly LOG_DIR=${PROJECT_ROOT}/logs/migrations
readonly METRICS_NAMESPACE="FantasyGM/Migrations"
readonly CONNECTION_POOL_SIZE=20
readonly TIMESTAMP=$(date +%Y%m%d_%H%M%S)
readonly SCRIPT_NAME=$(basename "$0")

# Logging setup
setup_logging() {
    mkdir -p "${LOG_DIR}"
    readonly LOG_FILE="${LOG_DIR}/migration_${ENVIRONMENT}_${TIMESTAMP}.log"
    exec 1> >(tee -a "${LOG_FILE}")
    exec 2> >(tee -a "${LOG_FILE}" >&2)
}

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [${SCRIPT_NAME}] $1"
}

error() {
    log "ERROR: $1" >&2
    exit 1
}

# CloudWatch metrics
push_metric() {
    local metric_name=$1
    local value=$2
    local unit=${3:-Count}

    aws cloudwatch put-metric-data \
        --namespace "${METRICS_NAMESPACE}" \
        --metric-name "${metric_name}" \
        --value "${value}" \
        --unit "${unit}" \
        --dimensions Environment="${ENVIRONMENT}" \
        --timestamp "$(date -u +%FT%TZ)" || true
}

# Prerequisites check
check_prerequisites() {
    log "Checking prerequisites..."

    # Check required tools
    command -v psql >/dev/null 2>&1 || error "PostgreSQL client is required"
    command -v alembic >/dev/null 2>&1 || error "Alembic is required"
    command -v aws >/dev/null 2>&1 || error "AWS CLI is required"

    # Verify PostgreSQL version
    local pg_version
    pg_version=$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -n1)
    if (( $(echo "$pg_version < 15.0" | bc -l) )); then
        error "PostgreSQL 15+ is required (found ${pg_version})"
    fi

    # Check environment configuration
    if [[ ! -f "${BACKEND_DIR}/.env" ]]; then
        error "Environment configuration file not found"
    fi

    # Verify directories
    for dir in "${MIGRATIONS_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"; do
        mkdir -p "${dir}"
        if [[ ! -w "${dir}" ]]; then
            error "Directory ${dir} is not writable"
        fi
    fi

    log "Prerequisites check completed successfully"
    return 0
}

# Database backup
create_backup() {
    log "Creating database backup..."
    
    local backup_file="${BACKUP_DIR}/backup_${TIMESTAMP}.sql.gz"
    local s3_path="s3://${AWS_S3_BUCKET}/backups/${ENVIRONMENT}/backup_${TIMESTAMP}.sql.gz"
    
    # Create backup directory if it doesn't exist
    mkdir -p "${BACKUP_DIR}"

    # Execute backup with optimized settings
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        -F c \
        -Z 9 \
        -j "${CONNECTION_POOL_SIZE}" \
        -v \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        | gzip > "${backup_file}"

    if [[ ! -f "${backup_file}" ]]; then
        error "Backup creation failed"
    fi

    # Calculate and verify checksum
    local checksum
    checksum=$(md5sum "${backup_file}" | cut -d' ' -f1)
    echo "${checksum}" > "${backup_file}.md5"

    # Upload to S3 with server-side encryption
    aws s3 cp "${backup_file}" "${s3_path}" \
        --sse AES256 \
        --metadata "checksum=${checksum}"

    # Push backup metrics
    push_metric "BackupSize" "$(stat -f%z "${backup_file}")" "Bytes"
    push_metric "BackupSuccess" 1

    log "Backup created successfully: ${backup_file}"
    echo "${backup_file}"
}

# Migration execution
run_migrations() {
    local direction=${1:-"upgrade"}
    local start_time
    start_time=$(date +%s)

    log "Starting database migration (${direction})..."

    # Set Alembic environment variables
    export PYTHONPATH="${BACKEND_DIR}:${PYTHONPATH:-}"
    export FANTASY_GM_ENVIRONMENT="${ENVIRONMENT}"

    # Execute migration
    if ! alembic -c "${MIGRATIONS_DIR}/alembic.ini" "${direction}" head; then
        push_metric "MigrationFailure" 1
        error "Migration failed"
    fi

    # Calculate execution time
    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))

    # Push success metrics
    push_metric "MigrationDuration" "${duration}" "Seconds"
    push_metric "MigrationSuccess" 1

    log "Migration completed successfully in ${duration} seconds"
    return 0
}

# Migration verification
verify_migration() {
    log "Verifying migration..."
    local verification_errors=0

    # Check database connectivity
    if ! psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
        ((verification_errors++))
        log "ERROR: Database connectivity check failed"
    fi

    # Verify schema version
    local current_revision
    current_revision=$(alembic -c "${MIGRATIONS_DIR}/alembic.ini" current)
    if [[ $? -ne 0 ]]; then
        ((verification_errors++))
        log "ERROR: Schema version verification failed"
    fi

    # Check database constraints
    psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" \
        -c "SELECT conname, contype FROM pg_constraint WHERE convalidated = false;" \
        | grep -q "." && ((verification_errors++))

    # Push verification metrics
    push_metric "VerificationErrors" "${verification_errors}"

    if ((verification_errors > 0)); then
        error "Migration verification failed with ${verification_errors} errors"
    fi

    log "Migration verification completed successfully"
    return 0
}

# Rollback handling
handle_rollback() {
    local backup_file=$1
    log "Initiating rollback using backup: ${backup_file}"

    # Verify backup file exists
    if [[ ! -f "${backup_file}" ]]; then
        error "Backup file not found: ${backup_file}"
    fi

    # Verify backup checksum
    if ! md5sum -c "${backup_file}.md5" >/dev/null 2>&1; then
        error "Backup file checksum verification failed"
    }

    # Execute rollback
    if ! gunzip -c "${backup_file}" | \
        PGPASSWORD="${DB_PASSWORD}" psql \
            -h "${DB_HOST}" \
            -U "${DB_USER}" \
            -d "${DB_NAME}" \
            -v ON_ERROR_STOP=1; then
        push_metric "RollbackFailure" 1
        error "Rollback failed"
    fi

    push_metric "RollbackSuccess" 1
    log "Rollback completed successfully"
    return 0
}

# Main execution
main() {
    setup_logging
    log "Starting migration process for environment: ${ENVIRONMENT}"

    # Validate environment
    case "${ENVIRONMENT}" in
        dev|staging|prod)
            ;;
        *)
            error "Invalid environment: ${ENVIRONMENT}"
            ;;
    esac

    # Execute migration process
    if ! check_prerequisites; then
        error "Prerequisites check failed"
    fi

    local backup_file
    backup_file=$(create_backup)

    if ! run_migrations "upgrade"; then
        log "Migration failed, initiating rollback..."
        handle_rollback "${backup_file}"
        exit 1
    fi

    if ! verify_migration; then
        log "Verification failed, initiating rollback..."
        handle_rollback "${backup_file}"
        exit 1
    fi

    log "Migration process completed successfully"
    exit 0
}

# Script execution
main "$@"