# Prometheus Terraform Configuration for Fantasy Sports GM Assistant
# Provider version: hashicorp/aws ~> 4.0

# EFS File System for Prometheus data persistence
resource "aws_efs_file_system" "prometheus" {
  creation_token = "${var.project_name}-prometheus-${var.environment}"
  encrypted      = true
  
  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }
  
  tags = merge(local.monitoring_tags, {
    Name = "${local.name_prefix}-prometheus-efs"
  })
}

# EFS Mount Targets in each private subnet
resource "aws_efs_mount_target" "prometheus" {
  count           = length(data.aws_subnet.private[*].id)
  file_system_id  = aws_efs_file_system.prometheus.id
  subnet_id       = data.aws_subnet.private[count.index].id
  security_groups = [aws_security_group.prometheus_efs.id]
}

# Security Group for Prometheus EFS
resource "aws_security_group" "prometheus_efs" {
  name_prefix = "${local.name_prefix}-prometheus-efs-"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.prometheus.id]
  }
  
  tags = merge(local.monitoring_tags, {
    Name = "${local.name_prefix}-prometheus-efs-sg"
  })
}

# Security Group for Prometheus
resource "aws_security_group" "prometheus" {
  name_prefix = "${local.name_prefix}-prometheus-"
  vpc_id      = var.vpc_id
  
  ingress {
    from_port       = 9090
    to_port         = 9090
    protocol        = "tcp"
    security_groups = [data.aws_security_group.alb.id]
  }
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = merge(local.monitoring_tags, {
    Name = "${local.name_prefix}-prometheus-sg"
  })
}

# IAM Role for Prometheus ECS Task Execution
resource "aws_iam_role" "prometheus_execution" {
  name = "${local.name_prefix}-prometheus-execution"
  
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

# IAM Role for Prometheus ECS Task
resource "aws_iam_role" "prometheus_task" {
  name = "${local.name_prefix}-prometheus-task"
  
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

# IAM Policy for Prometheus Task Role
resource "aws_iam_role_policy" "prometheus_task" {
  name = "${local.name_prefix}-prometheus-task-policy"
  role = aws_iam_role.prometheus_task.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:DescribeContainerInstances",
          "ecs:DescribeClusters"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.prometheus_data.arn}/*"
      }
    ]
  })
}

# S3 Bucket for Prometheus long-term storage
resource "aws_s3_bucket" "prometheus_data" {
  bucket = "${local.name_prefix}-prometheus-data"
  
  tags = local.monitoring_tags
}

# S3 Bucket versioning
resource "aws_s3_bucket_versioning" "prometheus_data" {
  bucket = aws_s3_bucket.prometheus_data.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "prometheus_data" {
  bucket = aws_s3_bucket.prometheus_data.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Prometheus ECS Task Definition
resource "aws_ecs_task_definition" "prometheus" {
  family                   = "${local.name_prefix}-prometheus"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = 4096
  memory                  = 8192
  execution_role_arn      = aws_iam_role.prometheus_execution.arn
  task_role_arn          = aws_iam_role.prometheus_task.arn
  
  container_definitions = jsonencode([
    {
      name  = "prometheus"
      image = "prom/prometheus:v2.45.0"
      
      portMappings = [{
        containerPort = 9090
        protocol      = "tcp"
      }]
      
      mountPoints = [{
        sourceVolume  = "prometheus-data"
        containerPath = "/prometheus"
        readOnly      = false
      }]
      
      environment = [
        {
          name  = "PROMETHEUS_RETENTION_TIME"
          value = "${var.prometheus_retention_days}d"
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/${local.name_prefix}-prometheus"
          awslogs-region        = data.aws_region.current.name
          awslogs-stream-prefix = "prometheus"
        }
      }
      
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q --spider http://localhost:9090/-/healthy || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
  
  volume {
    name = "prometheus-data"
    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.prometheus.id
      root_directory     = "/"
      transit_encryption = "ENABLED"
    }
  }
  
  tags = local.monitoring_tags
}

# Prometheus ECS Service
resource "aws_ecs_service" "prometheus" {
  name            = "${local.name_prefix}-prometheus"
  cluster         = data.aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.prometheus.arn
  desired_count   = 2
  launch_type     = "FARGATE"
  
  network_configuration {
    subnets          = data.aws_subnet.private[*].id
    security_groups  = [aws_security_group.prometheus.id]
    assign_public_ip = false
  }
  
  load_balancer {
    target_group_arn = aws_lb_target_group.prometheus.arn
    container_name   = "prometheus"
    container_port   = 9090
  }
  
  service_registries {
    registry_arn = aws_service_discovery_service.prometheus.arn
  }
  
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  
  tags = local.monitoring_tags
}

# Application Load Balancer Target Group
resource "aws_lb_target_group" "prometheus" {
  name        = "${local.name_prefix}-prometheus"
  port        = 9090
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"
  
  health_check {
    enabled             = true
    path                = "/-/healthy"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
  
  tags = local.monitoring_tags
}

# Service Discovery for Prometheus
resource "aws_service_discovery_service" "prometheus" {
  name = "prometheus"
  
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

# CloudWatch Log Group for Prometheus
resource "aws_cloudwatch_log_group" "prometheus" {
  name              = "/ecs/${local.name_prefix}-prometheus"
  retention_in_days = 30
  
  tags = local.monitoring_tags
}

# Outputs
output "prometheus_endpoint" {
  description = "Prometheus endpoint URL"
  value       = "http://${aws_lb_target_group.prometheus.name}.${data.aws_route53_zone.main.name}:9090"
}

output "prometheus_security_group_id" {
  description = "Security group ID for Prometheus"
  value       = aws_security_group.prometheus.id
}