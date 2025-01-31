# AWS ECS Cluster Configuration for Fantasy Sports GM Assistant
# Provider: hashicorp/aws ~> 4.0

# ECS Cluster with enhanced monitoring and capacity providers
resource "aws_ecs_cluster" "main" {
  name = "${var.project_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }

  configuration {
    execute_command_configuration {
      logging = "OVERRIDE"
      log_configuration {
        cloud_watch_log_group_name = aws_cloudwatch_log_group.ecs_cluster.name
      }
    }
  }

  tags = {
    Environment        = var.environment
    Project           = var.project_name
    ManagedBy         = "Terraform"
    CostCenter        = "fantasy-sports"
    DataClassification = "internal"
  }
}

# CloudWatch Log Group for ECS Cluster
resource "aws_cloudwatch_log_group" "ecs_cluster" {
  name              = "/aws/ecs/${var.project_name}-${var.environment}"
  retention_in_days = 30

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# API Service Task Definition
resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project_name}-api-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.ecs_api_cpu[var.environment]
  memory                  = var.ecs_api_memory[var.environment]
  execution_role_arn      = var.ecs_task_role_arn
  task_role_arn           = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${var.api_repository_url}:latest"
      portMappings = [
        {
          containerPort = 8000
          protocol      = "tcp"
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/aws/ecs/${var.project_name}-api-${var.environment}"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "api"
        }
      }
      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        }
      ]
    }
  ])

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "api"
  }
}

# Worker Service Task Definition
resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project_name}-worker-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = var.ecs_worker_cpu[var.environment]
  memory                  = var.ecs_worker_memory[var.environment]
  execution_role_arn      = var.ecs_task_role_arn
  task_role_arn           = var.ecs_task_role_arn

  container_definitions = jsonencode([
    {
      name  = "worker"
      image = "${var.worker_repository_url}:latest"
      healthCheck = {
        command     = ["CMD-SHELL", "python -c 'import http.client; conn = http.client.HTTPConnection(\"localhost:8001\"); conn.request(\"GET\", \"/health\"); response = conn.getresponse(); exit(0 if response.status == 200 else 1)'"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/aws/ecs/${var.project_name}-worker-${var.environment}"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "worker"
        }
      }
      environment = [
        {
          name  = "ENVIRONMENT"
          value = var.environment
        }
      ]
    }
  ])

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "worker"
  }
}

# API Service
resource "aws_ecs_service" "api" {
  name                              = "${var.project_name}-api-${var.environment}"
  cluster                          = aws_ecs_cluster.main.id
  task_definition                  = aws_ecs_task_definition.api.arn
  desired_count                    = var.environment == "prod" ? 3 : 1
  launch_type                      = "FARGATE"
  platform_version                 = "LATEST"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight           = 1
    base             = 1
  }

  service_registries {
    registry_arn = aws_service_discovery_service.api.arn
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "api"
  }
}

# Worker Service
resource "aws_ecs_service" "worker" {
  name                              = "${var.project_name}-worker-${var.environment}"
  cluster                          = aws_ecs_cluster.main.id
  task_definition                  = aws_ecs_task_definition.worker.arn
  desired_count                    = var.environment == "prod" ? 2 : 1
  launch_type                      = "FARGATE"
  platform_version                 = "LATEST"
  health_check_grace_period_seconds = 60

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight           = 1
    base             = 1
  }

  service_registries {
    registry_arn = aws_service_discovery_service.worker.arn
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "worker"
  }
}

# Service Discovery Namespace
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.project_name}.local"
  description = "Service discovery namespace for ${var.project_name}"
  vpc         = var.vpc_id

  tags = {
    Environment = var.environment
    Project     = var.project_name
  }
}

# Service Discovery Service - API
resource "aws_service_discovery_service" "api" {
  name = "api"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "api"
  }
}

# Service Discovery Service - Worker
resource "aws_service_discovery_service" "worker" {
  name = "worker"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = {
    Environment = var.environment
    Project     = var.project_name
    Service     = "worker"
  }
}

# Data source for current AWS region
data "aws_region" "current" {}

# Outputs
output "cluster_id" {
  description = "The ID of the ECS cluster"
  value       = aws_ecs_cluster.main.id
}

output "cluster_arn" {
  description = "The ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "api_service_name" {
  description = "The name of the API service"
  value       = aws_ecs_service.api.name
}

output "worker_service_name" {
  description = "The name of the worker service"
  value       = aws_ecs_service.worker.name
}