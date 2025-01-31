# Grafana Terraform Configuration for Fantasy Sports GM Assistant
# Provider version: hashicorp/aws ~> 4.0
# Provider version: grafana/grafana ~> 1.0

# EFS File System for Grafana data persistence
resource "aws_efs_file_system" "grafana_data" {
  creation_token = "${var.project_name}-grafana-${var.environment}"
  encrypted      = true
  
  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }
  
  tags = merge(local.monitoring_tags, {
    Name = "${local.name_prefix}-grafana-efs"
  })
}

# EFS Mount Targets in private subnets
resource "aws_efs_mount_target" "grafana" {
  count           = length(data.aws_subnet.private[*].id)
  file_system_id  = aws_efs_file_system.grafana_data.id
  subnet_id       = data.aws_subnet.private[count.index].id
  security_groups = [aws_security_group.grafana.id]
}

# Security Group for Grafana
resource "aws_security_group" "grafana" {
  name_prefix = "${local.name_prefix}-grafana-"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [data.aws_security_group.alb.id]
  }
  
  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    cidr_blocks     = ["10.0.0.0/16"]
    description     = "EFS mount target access"
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(local.monitoring_tags, {
    Name = "${local.name_prefix}-grafana-sg"
  })
}

# IAM Role for Grafana ECS Task Execution
resource "aws_iam_role" "grafana_execution" {
  name = "${local.name_prefix}-grafana-execution"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
  
  tags = local.monitoring_tags
}

# IAM Role for Grafana ECS Task
resource "aws_iam_role" "grafana_task" {
  name = "${local.name_prefix}-grafana-task"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })
  
  tags = local.monitoring_tags
}

# Grafana ECS Task Definition
resource "aws_ecs_task_definition" "grafana" {
  family                   = "${local.name_prefix}-grafana"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = 1024
  memory                  = 2048
  execution_role_arn      = aws_iam_role.grafana_execution.arn
  task_role_arn           = aws_iam_role.grafana_task.arn
  
  container_definitions = jsonencode([
    {
      name  = "grafana"
      image = "grafana/grafana-enterprise:9.5.0"
      
      portMappings = [{
        containerPort = 3000
        protocol      = "tcp"
      }]
      
      mountPoints = [{
        sourceVolume  = "grafana-data"
        containerPath = "/var/lib/grafana"
        readOnly      = false
      }]
      
      environment = [
        {
          name  = "GF_SECURITY_ADMIN_PASSWORD"
          value = var.grafana_admin_password
        },
        {
          name  = "GF_INSTALL_PLUGINS"
          value = "grafana-piechart-panel,grafana-worldmap-panel"
        },
        {
          name  = "GF_PATHS_PROVISIONING"
          value = "/etc/grafana/provisioning"
        },
        {
          name  = "GF_AUTH_ANONYMOUS_ENABLED"
          value = "false"
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${local.name_prefix}-grafana"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "grafana"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q --spider http://localhost:3000/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
  
  volume {
    name = "grafana-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.grafana_data.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
    }
  }
  
  tags = local.monitoring_tags
}

# Grafana ECS Service
resource "aws_ecs_service" "grafana" {
  name            = "${local.name_prefix}-grafana"
  cluster         = data.aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.grafana.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = data.aws_subnet.private[*].id
    security_groups  = [aws_security_group.grafana.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.grafana.arn
    container_name   = "grafana"
    container_port   = 3000
  }
  
  service_registries {
    registry_arn = aws_service_discovery_service.grafana.arn
  }
  
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  
  tags = local.monitoring_tags
}

# Application Load Balancer Target Group
resource "aws_lb_target_group" "grafana" {
  name        = "${local.name_prefix}-grafana"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  
  health_check {
    enabled             = true
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
  
  tags = local.monitoring_tags
}

# Service Discovery for Grafana
resource "aws_service_discovery_service" "grafana" {
  name = "grafana"
  
  dns_config {
    namespace_id = data.aws_service_discovery_private_dns_namespace.main.id
    
    dns_records {
      ttl  = 10
      type = "A"
    }
    
    routing_policy = "MULTIVALUE"
  }
  
  health_check_custom_config {
    failure_threshold = 1
  }
}

# CloudWatch Log Group for Grafana
resource "aws_cloudwatch_log_group" "grafana" {
  name              = "/ecs/${local.name_prefix}-grafana"
  retention_in_days = 30
  
  tags = local.monitoring_tags
}

# Outputs
output "grafana_endpoint" {
  description = "Grafana endpoint URL"
  value       = "http://${aws_lb_target_group.grafana.name}.${data.aws_route53_zone.main.name}:3000"
}

output "grafana_security_group_id" {
  description = "Security group ID for Grafana"
  value       = aws_security_group.grafana.id
}