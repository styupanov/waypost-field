locals {
  workflow_task_definition = aws_ecs_task_definition.etl.arn
  workflow_states = merge(local.workflow_definition.States, {
    ProcessRawToProcessed = merge(local.workflow_definition.States.ProcessRawToProcessed, {
      Next = "BuildRouteAnalytics"
      Parameters = merge(local.workflow_definition.States.ProcessRawToProcessed.Parameters, {
        TaskDefinition = local.workflow_task_definition
      })
    })
    BuildRouteAnalytics = merge(local.workflow_definition.States.ProcessRawToProcessed, {
      Next = "LoadProcessedToRds"
      Parameters = merge(local.workflow_definition.States.ProcessRawToProcessed.Parameters, {
        TaskDefinition = local.workflow_task_definition
        Overrides = {
          ContainerOverrides = [{
            Name        = var.container_name
            "Command.$" = "States.Array('etl/write_route_parquet.py', '--bucket', $.bucket, '--key', $.processedKey)"
          }]
        }
      })
      Catch = [{
        ErrorEquals = ["States.ALL"]
        ResultPath  = "$.error"
        Next        = "BuildRouteAnalyticsFailed"
      }]
    })
    LoadProcessedToRds = merge(local.workflow_definition.States.LoadProcessedToRds, {
      Parameters = merge(local.workflow_definition.States.LoadProcessedToRds.Parameters, {
        TaskDefinition = local.workflow_task_definition
      })
    })
    BuildRouteAnalyticsFailed = {
      Type  = "Fail"
      Error = "BuildRouteAnalyticsFailed"
      Cause = "PROCESSED to GeoParquet analytics failed after retries"
    }
  })
  phase2_workflow_definition = merge(local.workflow_definition, {
    States = local.workflow_states
  })
}

resource "aws_sfn_state_machine" "pipeline" {
  name       = "${local.name}-pipeline"
  type       = "STANDARD"
  role_arn   = aws_iam_role.etl["stepfunctions"].arn
  definition = jsonencode(local.phase2_workflow_definition)
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
  # Protect the adopted state machine from accidental deletion during future changes.
  lifecycle {
    prevent_destroy = true
  }
}
