resource "aws_iam_role" "web_execution" {
  name = "travel-dev-web-execution-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = { project = "travel", component = "web", environment = "dev" }
}

resource "aws_iam_role_policy_attachment" "web_execution" {
  role       = aws_iam_role.web_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "web_execution_secrets" {
  name = "travel-dev-web-secret-read"
  role = aws_iam_role.web_execution.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = var.web_secret_arn
    }]
  })
}

resource "aws_iam_role" "web_task" {
  name = "travel-dev-web-task-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = { project = "travel", component = "web", environment = "dev" }
}

resource "aws_iam_role_policy" "web_task_raw_archive" {
  name = "travel-dev-web-raw-archive"
  role = aws_iam_role.web_task.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = "arn:aws:s3:::${var.raw_bucket}/raw/routing/here/*"
    }]
  })
}
