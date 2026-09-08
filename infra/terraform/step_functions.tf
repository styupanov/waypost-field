resource "aws_sfn_state_machine" "pipeline" {
  name       = "${local.name}-pipeline"
  type       = "STANDARD"
  role_arn   = aws_iam_role.etl["stepfunctions"].arn
  definition = jsonencode(local.workflow_definition)
  logging_configuration {
    level                  = "OFF"
    include_execution_data = false
  }
  tracing_configuration {
    enabled = false
  }
  encryption_configuration {
    type = "AWS_OWNED_KEY"
  }
  # Live ASL stays pinned to task revision 1; adoption must not launch a new revision.
  lifecycle {
    prevent_destroy = true
  }
}
