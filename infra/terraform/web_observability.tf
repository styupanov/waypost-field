resource "aws_cloudwatch_log_group" "web" {
  name              = "/ecs/travel-dev-web"
  retention_in_days = 7
  log_group_class   = "STANDARD"
  tags              = { project = "travel", component = "web", environment = "dev" }
}
