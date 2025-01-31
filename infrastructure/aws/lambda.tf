# AWS Lambda Functions Configuration for Fantasy Sports GM Assistant
# Provider version: hashicorp/aws ~> 4.0

# Common Lambda configuration locals
locals {
  lambda_common_tags = merge(var.tags, {
    Service = "Lambda"
    UpdatedAt = timestamp()
  })

  lambda_memory_config = {
    simulation = {
      dev     = 2048
      staging = 4096
      prod    = 8192
    }
    media = {
      dev     = 4096
      staging = 8192
      prod    = 10240
    }
    analytics = {
      dev     = 1024
      staging = 2048
      prod    = 4096
    }
  }

  lambda_timeout_config = {
    simulation = 900  # 15 minutes for Monte Carlo simulations
    media      = 900  # 15 minutes for video generation
    analytics  = 300  # 5 minutes for analytics processing
  }
}

# Monte Carlo Simulation Processor Lambda
resource "aws_lambda_function" "simulation_processor" {
  filename         = "lambda/simulation_processor.zip"
  function_name    = "${var.project_name}-simulation-processor-${var.environment}"
  role            = var.ecs_task_role_arn
  handler         = "simulation_processor.handler"
  runtime         = "python3.11"
  
  memory_size     = local.lambda_memory_config.simulation[var.environment]
  timeout         = local.lambda_timeout_config.simulation

  environment {
    variables = {
      ENVIRONMENT = var.environment
      REDIS_HOST = data.aws_elasticache_cluster.redis.cache_nodes[0].address
      LOG_LEVEL  = var.environment == "prod" ? "INFO" : "DEBUG"
    }
  }

  vpc_config {
    subnet_ids         = data.aws_subnets.private.ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  tracing_config {
    mode = "Active"
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.simulation_dlq.arn
  }

  tags = local.lambda_common_tags
}

# Media Generation Processor Lambda
resource "aws_lambda_function" "media_processor" {
  filename         = "lambda/media_processor.zip"
  function_name    = "${var.project_name}-media-processor-${var.environment}"
  role            = var.ecs_task_role_arn
  handler         = "media_processor.handler"
  runtime         = "python3.11"
  
  memory_size     = local.lambda_memory_config.media[var.environment]
  timeout         = local.lambda_timeout_config.media

  environment {
    variables = {
      ENVIRONMENT = var.environment
      RUNWAY_API_KEY = data.aws_secretsmanager_secret_version.runway_api_key.secret_string
      ELEVEN_LABS_API_KEY = data.aws_secretsmanager_secret_version.eleven_labs_api_key.secret_string
      S3_BUCKET = "${var.project_name}-media-${var.environment}"
    }
  }

  vpc_config {
    subnet_ids         = data.aws_subnets.private.ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  tracing_config {
    mode = "Active"
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.media_dlq.arn
  }

  tags = local.lambda_common_tags
}

# Analytics Processor Lambda
resource "aws_lambda_function" "analytics_processor" {
  filename         = "lambda/analytics_processor.zip"
  function_name    = "${var.project_name}-analytics-processor-${var.environment}"
  role            = var.ecs_task_role_arn
  handler         = "analytics_processor.handler"
  runtime         = "python3.11"
  
  memory_size     = local.lambda_memory_config.analytics[var.environment]
  timeout         = local.lambda_timeout_config.analytics

  environment {
    variables = {
      ENVIRONMENT = var.environment
      REDIS_HOST = data.aws_elasticache_cluster.redis.cache_nodes[0].address
      FIRESTORE_PROJECT = "${var.project_name}-${var.environment}"
    }
  }

  vpc_config {
    subnet_ids         = data.aws_subnets.private.ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  tracing_config {
    mode = "Active"
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.analytics_dlq.arn
  }

  tags = local.lambda_common_tags
}

# Event Source Mappings for SQS Triggers
resource "aws_lambda_event_source_mapping" "simulation_queue" {
  event_source_arn = aws_sqs_queue.simulation_queue.arn
  function_name    = aws_lambda_function.simulation_processor.arn
  
  batch_size                         = 10
  maximum_batching_window_in_seconds = 30
  maximum_retry_attempts             = 3
  maximum_record_age_in_seconds      = 21600  # 6 hours
  
  scaling_config {
    maximum_concurrency = var.environment == "prod" ? 50 : 10
  }

  enabled = true
}

resource "aws_lambda_event_source_mapping" "media_queue" {
  event_source_arn = aws_sqs_queue.media_queue.arn
  function_name    = aws_lambda_function.media_processor.arn
  
  batch_size                         = 1  # Process media generation one at a time
  maximum_batching_window_in_seconds = 0
  maximum_retry_attempts             = 2
  maximum_record_age_in_seconds      = 43200  # 12 hours
  
  scaling_config {
    maximum_concurrency = var.environment == "prod" ? 20 : 5
  }

  enabled = true
}

resource "aws_lambda_event_source_mapping" "analytics_queue" {
  event_source_arn = aws_sqs_queue.analytics_queue.arn
  function_name    = aws_lambda_function.analytics_processor.arn
  
  batch_size                         = 20
  maximum_batching_window_in_seconds = 60
  maximum_retry_attempts             = 3
  maximum_record_age_in_seconds      = 7200  # 2 hours
  
  scaling_config {
    maximum_concurrency = var.environment == "prod" ? 30 : 10
  }

  enabled = true
}

# Lambda Security Group
resource "aws_security_group" "lambda" {
  name        = "${var.project_name}-lambda-${var.environment}"
  description = "Security group for Lambda functions"
  vpc_id      = data.aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.lambda_common_tags
}

# CloudWatch Log Groups with retention
resource "aws_cloudwatch_log_group" "simulation_logs" {
  name              = "/aws/lambda/${aws_lambda_function.simulation_processor.function_name}"
  retention_in_days = var.environment == "prod" ? 30 : 7
  tags             = local.lambda_common_tags
}

resource "aws_cloudwatch_log_group" "media_logs" {
  name              = "/aws/lambda/${aws_lambda_function.media_processor.function_name}"
  retention_in_days = var.environment == "prod" ? 30 : 7
  tags             = local.lambda_common_tags
}

resource "aws_cloudwatch_log_group" "analytics_logs" {
  name              = "/aws/lambda/${aws_lambda_function.analytics_processor.function_name}"
  retention_in_days = var.environment == "prod" ? 30 : 7
  tags             = local.lambda_common_tags
}

# Outputs
output "simulation_function_arn" {
  description = "ARN of the simulation processor Lambda function"
  value       = aws_lambda_function.simulation_processor.arn
}

output "media_function_arn" {
  description = "ARN of the media processor Lambda function"
  value       = aws_lambda_function.media_processor.arn
}

output "analytics_function_arn" {
  description = "ARN of the analytics processor Lambda function"
  value       = aws_lambda_function.analytics_processor.arn
}