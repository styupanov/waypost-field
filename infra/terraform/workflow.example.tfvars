# REFERENCE SHAPE ONLY, NOT AN EXPORT OF THE EXISTING WORKFLOW.
# This file is not auto-loaded. Do not pass it to an import or plan.
# Replace with the actual ASL in private terraform.tfvars before adoption.
# Retry values, ResultPath, timeout, commands and public IP below are illustrative.
workflow_definition = {
  StartAt = "SplitRawKey"
  States = {
    SplitRawKey = {
      Type       = "Pass"
      Parameters = { "parts.$" = "States.StringSplit($.rawKey, '/')" }
      ResultPath = "$.keyParts"
      Next       = "PrepareInput"
    }
    PrepareInput = {
      Type = "Pass"
      Parameters = {
        "bucket.$"       = "$.bucket"
        "rawKey.$"       = "$.rawKey"
        "processedKey.$" = "States.Format('processed/{}/{}/{}/{}/{}/{}', $.keyParts.parts[1], $.keyParts.parts[2], $.keyParts.parts[3], $.keyParts.parts[4], $.keyParts.parts[5], $.keyParts.parts[6])"
      }
      Next = "ProcessRawToProcessed"
    }
    ProcessRawToProcessed = {
      Type     = "Task"
      Resource = "arn:aws:states:::ecs:runTask.sync"
      Parameters = {
        Cluster        = "arn:aws:ecs:us-east-1:954976315093:cluster/travel-dev-etl-cluster"
        TaskDefinition = "REPLACE_WITH_EXISTING_FULL_TASK_DEFINITION_ARN_AND_REVISION"
        LaunchType     = "FARGATE"
        NetworkConfiguration = {
          AwsvpcConfiguration = {
            Subnets        = ["subnet-03758b1f5545b9fd8", "subnet-0d400a6ca7d6db5c7"]
            SecurityGroups = ["sg-06ee833ccc47678ba"]
            AssignPublicIp = "ENABLED"
          }
        }
        Overrides = {
          ContainerOverrides = [{
            Name        = "REPLACE_WITH_EXISTING_CONTAINER_NAME"
            "Command.$" = "States.Array('etl/process_raw.py', '--bucket', $.bucket, '--key', $.rawKey)"
          }]
        }
      }
      ResultPath = null
      Retry      = [{ ErrorEquals = ["States.TaskFailed"], IntervalSeconds = 10, MaxAttempts = 2, BackoffRate = 2 }]
      Catch      = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "ProcessRawFailed" }]
      Next       = "LoadProcessedToRds"
    }
    LoadProcessedToRds = {
      Type     = "Task"
      Resource = "arn:aws:states:::ecs:runTask.sync"
      Parameters = {
        Cluster        = "arn:aws:ecs:us-east-1:954976315093:cluster/travel-dev-etl-cluster"
        TaskDefinition = "REPLACE_WITH_EXISTING_FULL_TASK_DEFINITION_ARN_AND_REVISION"
        LaunchType     = "FARGATE"
        NetworkConfiguration = {
          AwsvpcConfiguration = {
            Subnets        = ["subnet-03758b1f5545b9fd8", "subnet-0d400a6ca7d6db5c7"]
            SecurityGroups = ["sg-06ee833ccc47678ba"]
            AssignPublicIp = "ENABLED"
          }
        }
        Overrides = {
          ContainerOverrides = [{
            Name        = "REPLACE_WITH_EXISTING_CONTAINER_NAME"
            "Command.$" = "States.Array('etl/load_processed.py', '--target', 'rds-secret', '--bucket', $.bucket, '--key', $.processedKey)"
          }]
        }
      }
      ResultPath = null
      Retry      = [{ ErrorEquals = ["States.TaskFailed"], IntervalSeconds = 10, MaxAttempts = 2, BackoffRate = 2 }]
      Catch      = [{ ErrorEquals = ["States.ALL"], ResultPath = "$.error", Next = "LoadProcessedFailed" }]
      End        = true
    }
    ProcessRawFailed    = { Type = "Fail", Error = "ProcessRawFailed" }
    LoadProcessedFailed = { Type = "Fail", Error = "LoadProcessedFailed" }
  }
}
