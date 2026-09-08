resource "aws_cloudwatch_event_rule" "raw_created" {
  name           = "${local.name}-raw-created"
  event_bus_name = "default"
  state          = "ENABLED"
  event_pattern = jsonencode({
    source        = ["aws.s3"]
    "detail-type" = ["Object Created"]
    detail = {
      bucket = { name = [var.raw_bucket] }
      object = { key = [{ prefix = "raw/routing/here/" }] }
    }
  })
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_event_target" "pipeline" {
  rule           = aws_cloudwatch_event_rule.raw_created.name
  event_bus_name = "default"
  target_id      = var.event_target_id
  arn            = aws_sfn_state_machine.pipeline.arn
  role_arn       = aws_iam_role.etl["eventbridge"].arn
  input_transformer {
    input_paths = {
      bucket = "$.detail.bucket.name"
      rawKey = "$.detail.object.key"
    }
    input_template = local.event_input_template
  }
  lifecycle {
    prevent_destroy = true
  }
}
