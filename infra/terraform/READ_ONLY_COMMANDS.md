# Executed read-only AWS commands

Account 954976315093; inspection on 2026-09-07. These are records, not a script to run.
No secret-value, subscription-list, mutation, execution or task-launch commands were run.
ECR policy/lifecycle queries returned the corresponding NotFound exceptions.

```powershell
aws sts get-caller-identity --profile travel-dev --region us-east-1 --output json
aws ecr describe-repositories --repository-names travel-dev-etl --profile travel-dev --region us-east-1 --output json
aws ecr get-repository-policy --repository-name travel-dev-etl --profile travel-dev --region us-east-1 --output json
aws ecr get-lifecycle-policy --repository-name travel-dev-etl --profile travel-dev --region us-east-1 --output json
aws ecs describe-clusters --clusters travel-dev-etl-cluster --include SETTINGS CONFIGURATIONS TAGS --profile travel-dev --region us-east-1 --output json
aws ecs describe-task-definition --task-definition travel-dev-etl --include TAGS --profile travel-dev --region us-east-1 --output json
aws stepfunctions describe-state-machine --state-machine-arn arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline --profile travel-dev --region us-east-1 --output json
aws events describe-rule --name travel-dev-etl-raw-created --event-bus-name default --profile travel-dev --region us-east-1 --output json
aws events list-targets-by-rule --rule travel-dev-etl-raw-created --event-bus-name default --profile travel-dev --region us-east-1 --output json
aws logs describe-log-groups --log-group-name-prefix /ecs/travel-dev-etl --profile travel-dev --region us-east-1 --output json
aws cloudwatch describe-alarms --alarm-names travel-dev-etl-execution-failed --profile travel-dev --region us-east-1 --output json
aws sns get-topic-attributes --topic-arn arn:aws:sns:us-east-1:954976315093:travel-dev-etl-alerts --profile travel-dev --region us-east-1 --output json
aws iam get-role --role-name travel-dev-etl-task-role --profile travel-dev --region us-east-1 --output json
aws iam list-role-policies --role-name travel-dev-etl-task-role --profile travel-dev --region us-east-1 --output json
aws iam get-role-policy --role-name travel-dev-etl-task-role --policy-name travel-dev-etl-task-rolePolicy --profile travel-dev --region us-east-1 --output json
aws iam list-attached-role-policies --role-name travel-dev-etl-task-role --profile travel-dev --region us-east-1 --output json
aws iam get-role --role-name travel-dev-etl-execution-role --profile travel-dev --region us-east-1 --output json
aws iam list-role-policies --role-name travel-dev-etl-execution-role --profile travel-dev --region us-east-1 --output json
aws iam list-attached-role-policies --role-name travel-dev-etl-execution-role --profile travel-dev --region us-east-1 --output json
aws iam get-policy --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy --profile travel-dev --region us-east-1 --output json
aws iam get-policy-version --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy --version-id v1 --profile travel-dev --region us-east-1 --output json
aws iam get-role --role-name travel-dev-etl-stepfunctions-role --profile travel-dev --region us-east-1 --output json
aws iam list-role-policies --role-name travel-dev-etl-stepfunctions-role --profile travel-dev --region us-east-1 --output json
aws iam get-role-policy --role-name travel-dev-etl-stepfunctions-role --policy-name travel-dev-etl-stepfunctions-policy --profile travel-dev --region us-east-1 --output json
aws iam list-attached-role-policies --role-name travel-dev-etl-stepfunctions-role --profile travel-dev --region us-east-1 --output json
aws iam get-role --role-name travel-dev-etl-eventbridge-role --profile travel-dev --region us-east-1 --output json
aws iam list-role-policies --role-name travel-dev-etl-eventbridge-role --profile travel-dev --region us-east-1 --output json
aws iam get-role-policy --role-name travel-dev-etl-eventbridge-role --policy-name travel-dev-etl-eventbridge-rolePolicy --profile travel-dev --region us-east-1 --output json
aws iam list-attached-role-policies --role-name travel-dev-etl-eventbridge-role --profile travel-dev --region us-east-1 --output json
aws ecr list-tags-for-resource --resource-arn arn:aws:ecr:us-east-1:954976315093:repository/travel-dev-etl --profile travel-dev --region us-east-1 --output json
aws sns list-tags-for-resource --resource-arn arn:aws:sns:us-east-1:954976315093:travel-dev-etl-alerts --profile travel-dev --region us-east-1 --output json
aws stepfunctions list-tags-for-resource --resource-arn arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline --profile travel-dev --region us-east-1 --output json
aws events list-tags-for-resource --resource-arn arn:aws:events:us-east-1:954976315093:rule/travel-dev-etl-raw-created --profile travel-dev --region us-east-1 --output json
aws logs list-tags-for-resource --resource-arn arn:aws:logs:us-east-1:954976315093:log-group:/ecs/travel-dev-etl --profile travel-dev --region us-east-1 --output json
aws cloudwatch list-tags-for-resource --resource-arn arn:aws:cloudwatch:us-east-1:954976315093:alarm:travel-dev-etl-execution-failed --profile travel-dev --region us-east-1 --output json
```
