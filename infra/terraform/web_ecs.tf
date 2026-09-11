locals {
  web_secret_keys = [
    "DATABASE_URL",
    "AUTH_SECRET",
    "HERE_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "GEMINI_API_KEY",
    "LOCAL_AUTH_USER_A_EMAIL",
    "LOCAL_AUTH_USER_A_PASSWORD",
    "LOCAL_AUTH_USER_A_SUBJECT",
    "LOCAL_AUTH_USER_A_NAME",
  ]
}

resource "aws_ecs_task_definition" "web" {
  family                   = "travel-dev-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.web_execution.arn
  task_role_arn            = aws_iam_role.web_task.arn
  skip_destroy             = true

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name      = "web"
    image     = "${aws_ecr_repository.web.repository_url}:${var.web_image_tag}"
    essential = true
    portMappings = [{
      name          = "http"
      containerPort = 3000
      hostPort      = 3000
      protocol      = "tcp"
      appProtocol   = "http"
    }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "HOSTNAME", value = "0.0.0.0" },
      { name = "PORT", value = "3000" },
      { name = "ROUTING_PROVIDER", value = "here" },
      { name = "AUTH_TRUST_HOST", value = "true" },
      { name = "LOCAL_AUTH_ENABLED", value = "true" },
      { name = "RDS_SSL_ROOT_CERT", value = "/app/certs/global-bundle.pem" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "RAW_PROVIDER_ARCHIVE_ENABLED", value = "true" },
      { name = "RAW_PROVIDER_ARCHIVE_BUCKET", value = var.raw_bucket },
    ]
    secrets = [for key in local.web_secret_keys : {
      name      = key
      valueFrom = "${var.web_secret_arn}:${key}::"
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.web.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
  }])
}

resource "aws_ecs_service" "web" {
  name                              = "travel-dev-web"
  cluster                           = aws_ecs_cluster.etl.id
  task_definition                   = aws_ecs_task_definition.web.arn
  desired_count                     = 1
  launch_type                       = "FARGATE"
  platform_version                  = "1.4.0"
  health_check_grace_period_seconds = 30

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.web_task.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  depends_on = [
    aws_iam_role_policy.web_execution_secrets,
    aws_iam_role_policy.web_task_raw_archive,
    aws_iam_role_policy_attachment.web_execution,
    aws_lb_listener.web_http,
  ]

  tags = { project = "travel", component = "web", environment = "dev" }
}
