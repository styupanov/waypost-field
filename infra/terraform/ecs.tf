resource "aws_ecs_cluster" "etl" {
  name = "${local.name}-cluster"
  tags = { project = "travel", component = "etl", environment = "dev" }
  setting {
    name  = "containerInsights"
    value = "disabled"
  }
  configuration {
    execute_command_configuration {
      logging = "DEFAULT"
    }
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecs_cluster_capacity_providers" "etl" {
  cluster_name       = aws_ecs_cluster.etl.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
  # The existing default strategy is empty.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecs_task_definition" "etl" {
  family                   = local.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  task_role_arn            = aws_iam_role.etl["task"].arn
  execution_role_arn       = aws_iam_role.etl["execution"].arn
  skip_destroy             = true
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }
  container_definitions = jsonencode([merge(local.live_container, {
    name         = var.container_name
    image        = "${aws_ecr_repository.etl.repository_url}:${var.image_tag}"
    essential    = true
    portMappings = []
    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "RDS_SECRET_ID", value = var.secret_id },
      { name = "RDS_SSL_ROOT_CERT", value = "/app/certs/global-bundle.pem" }
    ]
    logConfiguration = merge(local.live_container.logConfiguration, {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.etl.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    })
  })])
  # Task definitions are immutable: an image change intentionally registers a new revision.
  # skip_destroy keeps the prior revision registered when Terraform replaces this instance.
}
