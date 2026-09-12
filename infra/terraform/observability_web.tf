resource "aws_cloudwatch_metric_alarm" "web_target_5xx" {
  alarm_name          = "travel-dev-web-target-5xx"
  alarm_description   = "Waypost web target returned 5 or more HTTP 5xx responses within 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"

  evaluation_periods  = 1
  datapoints_to_alarm = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.web.arn_suffix
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "web_unhealthy_targets" {
  alarm_name        = "travel-dev-web-unhealthy-targets"
  alarm_description = "Waypost ALB has one or more unhealthy web targets for at least 2 minutes."

  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  statistic           = "Maximum"
  period              = 60
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"

  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.web.arn_suffix
    TargetGroup  = aws_lb_target_group.web.arn_suffix
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "web_ecs_cpu_high" {
  alarm_name        = "travel-dev-web-ecs-cpu-high"
  alarm_description = "Waypost web ECS service CPU utilization is at or above 80% for 10 minutes."

  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.etl.name
    ServiceName = aws_ecs_service.web.name
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "web_ecs_memory_high" {
  alarm_name        = "travel-dev-web-ecs-memory-high"
  alarm_description = "Waypost web ECS service memory utilization is at or above 80% for 10 minutes."

  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  statistic           = "Average"
  period              = 300
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.etl.name
    ServiceName = aws_ecs_service.web.name
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu_high" {
  alarm_name        = "travel-dev-rds-cpu-high"
  alarm_description = "Waypost PostgreSQL CPU utilization is at or above 80% for 10 minutes."

  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = "travel-dev-postgres"
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_free_storage_low" {
  alarm_name        = "travel-dev-rds-free-storage-low"
  alarm_description = "Waypost PostgreSQL free storage is at or below 5 GiB for 10 minutes."

  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  statistic           = "Minimum"
  period              = 300
  threshold           = 5368709120
  comparison_operator = "LessThanOrEqualToThreshold"

  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = "travel-dev-postgres"
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_high" {
  alarm_name        = "travel-dev-rds-connections-high"
  alarm_description = "Waypost PostgreSQL has 80 or more database connections for 10 minutes."

  namespace           = "AWS/RDS"
  metric_name         = "DatabaseConnections"
  statistic           = "Maximum"
  period              = 300
  threshold           = 80
  comparison_operator = "GreaterThanOrEqualToThreshold"

  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"

  dimensions = {
    DBInstanceIdentifier = "travel-dev-postgres"
  }

  alarm_actions   = [aws_sns_topic.alerts.arn]
  actions_enabled = true

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_cloudwatch_dashboard" "dev_overview" {
  dashboard_name = "travel-dev-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 7

        properties = {
          metrics = [
            [
              "AWS/ApplicationELB",
              "RequestCount",
              "TargetGroup",
              aws_lb_target_group.web.arn_suffix,
              "LoadBalancer",
              aws_lb.web.arn_suffix
            ],
            [
              ".",
              "HTTPCode_Target_5XX_Count",
              ".",
              ".",
              ".",
              "."
            ]
          ]

          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          stat    = "Sum"
          period  = 300
          title   = "Waypost Web / Traffic & Errors"
        }
      },

      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 11
        height = 7

        properties = {
          metrics = [
            [
              "AWS/ApplicationELB",
              "TargetResponseTime",
              "TargetGroup",
              aws_lb_target_group.web.arn_suffix,
              "LoadBalancer",
              aws_lb.web.arn_suffix
            ],
            [
              ".",
              "UnHealthyHostCount",
              ".",
              ".",
              ".",
              ".",
              {
                color = "#d62728"
                stat  = "Maximum"
              }
            ]
          ]

          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          stat    = "Average"
          period  = 300
          title   = "Waypost Web / Health & Latency"
        }
      },

      {
        type   = "metric"
        x      = 0
        y      = 7
        width  = 12
        height = 7

        properties = {
          metrics = [
            [
              "AWS/ECS",
              "CPUUtilization",
              "ServiceName",
              aws_ecs_service.web.name,
              "ClusterName",
              aws_ecs_cluster.etl.name
            ],
            [
              ".",
              "MemoryUtilization",
              ".",
              ".",
              ".",
              "."
            ]
          ]

          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          title   = "Waypost Web / ECS Resources"
        }
      },

      {
        type   = "metric"
        x      = 12
        y      = 7
        width  = 11
        height = 7

        properties = {
          metrics = [
            [
              "AWS/RDS",
              "CPUUtilization",
              "DBInstanceIdentifier",
              "travel-dev-postgres",
              {
                period = 300
              }
            ],
            [
              ".",
              "DatabaseConnections",
              ".",
              ".",
              {
                period = 300
                stat   = "Maximum"
                yAxis  = "right"
              }
            ]
          ]

          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          stat    = "Average"
          title   = "Waypost DB / CPU & Connections"
        }
      },

      {
        type   = "metric"
        x      = 0
        y      = 14
        width  = 12
        height = 7

        properties = {
          metrics = [
            [
              "AWS/RDS",
              "FreeStorageSpace",
              "DBInstanceIdentifier",
              "travel-dev-postgres"
            ]
          ]

          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          stat    = "Minimum"
          period  = 300
          title   = "Waypost DB / Free Storage"
        }
      },

      {
        type   = "metric"
        x      = 12
        y      = 14
        width  = 11
        height = 7

        properties = {
          metrics = [
            [
              "AWS/States",
              "ExecutionsStarted",
              "StateMachineArn",
              aws_sfn_state_machine.pipeline.arn
            ],
            [
              ".",
              "ExecutionsSucceeded",
              ".",
              ".",
              {
                color = "#2ca02c"
              }
            ],
            [
              ".",
              "ExecutionsFailed",
              ".",
              ".",
              {
                color = "#d62728"
              }
            ]
          ]

          view    = "timeSeries"
          stacked = false
          region  = var.aws_region
          stat    = "Sum"
          period  = 300
          title   = "Waypost ETL / Executions"
        }
      }
    ]
  })
}