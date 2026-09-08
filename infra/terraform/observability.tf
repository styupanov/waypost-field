resource "aws_cloudwatch_log_group" "etl" {
  name              = "/ecs/${local.name}"
  retention_in_days = 7
  log_group_class   = "STANDARD"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_sns_topic" "alerts" {
  name           = "${local.name}-alerts"
  policy         = jsonencode(local.sns_policy)
  tracing_config = "PassThrough"
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "execution_failed" {
  alarm_name                = "${local.name}-execution-failed"
  namespace                 = "AWS/States"
  metric_name               = "ExecutionsFailed"
  dimensions                = { StateMachineArn = aws_sfn_state_machine.pipeline.arn }
  statistic                 = "Sum"
  period                    = 300
  threshold                 = 1
  comparison_operator       = "GreaterThanOrEqualToThreshold"
  evaluation_periods        = 1
  datapoints_to_alarm       = 1
  treat_missing_data        = "notBreaching"
  alarm_actions             = [aws_sns_topic.alerts.arn]
  actions_enabled           = true
  ok_actions                = []
  insufficient_data_actions = []
  lifecycle {
    prevent_destroy = true
  }
}
