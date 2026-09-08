output "repository_url" {
  value = aws_ecr_repository.etl.repository_url
}
output "cluster_arn" {
  value = aws_ecs_cluster.etl.arn
}
output "task_definition_arn" {
  value = aws_ecs_task_definition.etl.arn
}
output "pipeline_arn" {
  value = aws_sfn_state_machine.pipeline.arn
}
output "alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}
