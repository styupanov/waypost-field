# Reconciled import plan

## Glue analytics adoption (completed 2026-09-10)

The existing Glue database and table are now imported at these addresses:

```text
aws_glue_catalog_database.analytics
aws_glue_catalog_table.routes
```

Executed import commands:

```text
terraform import aws_glue_catalog_database.analytics 954976315093:travel_analytics
terraform import aws_glue_catalog_table.routes 954976315093:travel_analytics:routes
```

Both targeted plans returned detailed exit code 0 with no changes. GeoParquet objects under
`s3://geospatial-learning-sergei-2026/analytics/routing/routes/` remain data and are not
Terraform resources. Glue partitions are intentionally unmanaged; the table uses partition
projection, so future date partitions do not require `MSCK REPAIR TABLE`.

The ETL task role `aws_iam_role.etl["task"]` is now imported and its targeted plan returned
0. Do not rerun its role import. Its standalone inline policy remains unimported.

The Step Functions inline policy is now imported. Its targeted plan returned 2 solely
because the existing task and execution roles remain unimported; summary: 2 to add,
0 to change, 0 to destroy. No policy/role drift was proposed. Do not rerun this import
or apply that partial-adoption plan.

The Step Functions role `aws_iam_role.etl["stepfunctions"]` is now imported. Its targeted
plan returned 0 with no additions, changes or destructions. Do not rerun its role import.
Its standalone inline policy remains unimported and is a later checkpoint.

Checkpoint status: the log group, ECR repository, ECS cluster, cluster capacity-provider
association and SNS topic (`aws_sns_topic.alerts`) are now in state. Do not rerun their
import commands below. The SNS topic import and targeted plan completed successfully
with exit code 0; subscriptions remain intentionally excluded. See
[MIGRATION_NOTES.md](MIGRATION_NOTES.md) for results and the cluster-state provenance finding.

The EventBridge role `aws_iam_role.etl["eventbridge"]` is also imported and its role-targeted
plan returned 0. Its separate inline policy
`aws_iam_role_policy.etl["eventbridge/travel-dev-etl-eventbridge-rolePolicy"]` is now imported
as well; do not rerun either import. The policy-targeted plan returned **2**, proposing only
the three other unimported IAM roles (execution, stepfunctions, task) through the shared
dynamic role dependency. No policy/EventBridge-role changes were proposed. Do not apply;
see MIGRATION_NOTES.md for the exact partial-adoption result. This policy checkpoint does
not claim a globally clean targeted plan.

Read-only inspection completed 2026-09-07 in account 954976315093 / us-east-1.
No import, plan or apply has been executed. Import still requires separate authorization.
All 18 Phase 1 resource instances are enumerated below in proposed dependency order.
Run from infra/terraform with AWS_PROFILE=travel-dev. Defaults require no private tfvars.
Preserve quotes in for_each addresses with the native argument passing supported by your
PowerShell version; do not strip the literal double quotes inside square brackets.

| Terraform address | Existing AWS identifier | Risk / post-import check |
| --- | --- | --- |
| `aws_cloudwatch_log_group.etl` | `/ecs/travel-dev-etl` | Lowest-risk first import: standalone, name-based, STANDARD, 7 days, no KMS/tags. |
| `aws_ecr_repository.etl` | `travel-dev-etl` | Verify MUTABLE, AES256, scanOnPush=false, no tags; repository/lifecycle policy absent. Encryption diff may require replacement: stop. |
| `aws_ecs_cluster.etl` | `travel-dev-etl-cluster` | Verify three tags, disabled containerInsights, DEFAULT exec logging. |
| `aws_ecs_cluster_capacity_providers.etl` | `travel-dev-etl-cluster` | Verify FARGATE/FARGATE_SPOT and empty default strategy. This is association ownership, not new capacity providers. |
| `aws_sns_topic.alerts` | `arn:aws:sns:us-east-1:954976315093:travel-dev-etl-alerts` | Verify captured default policy and PassThrough tracing; do not inspect/manage email subscriptions. |
| `aws_iam_role.etl["task"]` | `travel-dev-etl-task-role` | Compare captured trust/description/path/session duration, absent boundary/tags; never apply an IAM diff during adoption. |
| `aws_iam_role_policy.etl["task/travel-dev-etl-task-rolePolicy"]` | `travel-dev-etl-task-role:travel-dev-etl-task-rolePolicy` | Compare exact JSON semantics, resources/actions/conditions. Preserve current scopes; tightening is separate work. |
| `aws_iam_role.etl["execution"]` | `travel-dev-etl-execution-role` | Compare captured trust/description/path/session duration, absent boundary/tags; never apply an IAM diff during adoption. |
| `aws_iam_role_policy_attachment.etl["execution/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]` | `travel-dev-etl-execution-role/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy` | Only attachment is owned; AWS-managed policy v1 content is not managed. |
| `aws_iam_role.etl["stepfunctions"]` | `travel-dev-etl-stepfunctions-role` | Compare captured trust/description/path/session duration, absent boundary/tags; never apply an IAM diff during adoption. |
| `aws_iam_role_policy.etl["stepfunctions/travel-dev-etl-stepfunctions-policy"]` | `travel-dev-etl-stepfunctions-role:travel-dev-etl-stepfunctions-policy` | Compare exact JSON semantics, resources/actions/conditions. Preserve current scopes; tightening is separate work. |
| `aws_iam_role.etl["eventbridge"]` | `travel-dev-etl-eventbridge-role` | Compare captured trust/description/path/session duration, absent boundary/tags; never apply an IAM diff during adoption. |
| `aws_iam_role_policy.etl["eventbridge/travel-dev-etl-eventbridge-rolePolicy"]` | `travel-dev-etl-eventbridge-role:travel-dev-etl-eventbridge-rolePolicy` | Compare exact JSON semantics, resources/actions/conditions. Preserve current scopes; tightening is separate work. |
| `aws_ecs_task_definition.etl` | `arn:aws:ecs:us-east-1:954976315093:task-definition/travel-dev-etl:1` | Highest normalization/replacement risk. Revision 1 is both latest ACTIVE and referenced by live ASL. Stop on any replacement/new revision. |
| `aws_sfn_state_machine.pipeline` | `arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline` | Compare exact captured ASL, including 900-second timeouts, three retries, jitter, catches, commands, network and pinned revision 1; OFF logging, disabled tracing, AWS_OWNED_KEY. |
| `aws_cloudwatch_event_rule.raw_created` | `travel-dev-etl-raw-created` | Default bus, ENABLED, exact bucket/prefix pattern. Preserve unmodeled service-created ECS sync rule. |
| `aws_cloudwatch_event_target.pipeline` | `travel-dev-etl-raw-created/Idbfdbec94-dc0c-4eee-855a-222f4406c067` | Exact target ID and template bytes; no explicit retry or DLQ. No new target or duplicate delivery. |
| `aws_cloudwatch_metric_alarm.execution_failed` | `travel-dev-etl-execution-failed` | Sum/300s/>=1/1-of-1/notBreaching; enabled actions, exact SNS alarm action, empty OK/insufficient actions. |

## Exact proposed commands (DO NOT execute yet)

```powershell
terraform import 'aws_cloudwatch_log_group.etl' '/ecs/travel-dev-etl'
terraform import 'aws_ecr_repository.etl' 'travel-dev-etl'
terraform import 'aws_ecs_cluster.etl' 'travel-dev-etl-cluster'
terraform import 'aws_ecs_cluster_capacity_providers.etl' 'travel-dev-etl-cluster'
terraform import 'aws_sns_topic.alerts' 'arn:aws:sns:us-east-1:954976315093:travel-dev-etl-alerts'
terraform import 'aws_iam_role.etl["task"]' 'travel-dev-etl-task-role'
terraform import 'aws_iam_role_policy.etl["task/travel-dev-etl-task-rolePolicy"]' 'travel-dev-etl-task-role:travel-dev-etl-task-rolePolicy'
terraform import 'aws_iam_role.etl["execution"]' 'travel-dev-etl-execution-role'
terraform import 'aws_iam_role_policy_attachment.etl["execution/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]' 'travel-dev-etl-execution-role/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
terraform import 'aws_iam_role.etl["stepfunctions"]' 'travel-dev-etl-stepfunctions-role'
terraform import 'aws_iam_role_policy.etl["stepfunctions/travel-dev-etl-stepfunctions-policy"]' 'travel-dev-etl-stepfunctions-role:travel-dev-etl-stepfunctions-policy'
terraform import 'aws_iam_role.etl["eventbridge"]' 'travel-dev-etl-eventbridge-role'
terraform import 'aws_iam_role_policy.etl["eventbridge/travel-dev-etl-eventbridge-rolePolicy"]' 'travel-dev-etl-eventbridge-role:travel-dev-etl-eventbridge-rolePolicy'
terraform import 'aws_ecs_task_definition.etl' 'arn:aws:ecs:us-east-1:954976315093:task-definition/travel-dev-etl:1'
terraform import 'aws_sfn_state_machine.pipeline' 'arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline'
terraform import 'aws_cloudwatch_event_rule.raw_created' 'travel-dev-etl-raw-created'
terraform import 'aws_cloudwatch_event_target.pipeline' 'travel-dev-etl-raw-created/Idbfdbec94-dc0c-4eee-855a-222f4406c067'
terraform import 'aws_cloudwatch_metric_alarm.execution_failed' 'travel-dev-etl-execution-failed'
```

Import the log group first: it has no resource dependencies, no policies/secret references,
a simple name ID, and only two observed settings to reconcile. Then follow the table order.
After each separately authorized import run terraform plan. The imported subset should
have no changes/deletions; full-plan additions for not-yet-imported blocks are expected and
must never be applied. Global 0 to add / 0 to change / 0 to destroy is a final milestone
after all 18 instances are adopted, not a claim made by offline validation.

## ECS task definition caveats

AWS returned cpu=0 and empty portMappings/environmentFiles/mountPoints/volumesFrom/ulimits/
systemControls/logConfiguration.secretOptions. These are preserved in the container baseline.
The provider may normalize empty lists and environment ordering. Compare decoded JSON,
not formatting. command, entryPoint, user, readonlyRootFilesystem and ephemeralStorage
were absent: do not materialize image defaults as task overrides. The image supplies its
entrypoint and user. requiresAttributes, compatibilities, status, registration metadata and
revision are computed AWS metadata, not input settings. Fault injection was false (default).
Full task configuration diffs can cause immutable new revisions; prevent_destroy will block
replacement and skip_destroy avoids deregistration, but neither proves no drift. Do not
disable guards, set blanket ignore_changes, or register a revision to force reconciliation.
The ASL remains pinned to revision 1; image_tag changes do not advance the workflow.

## Remaining caveats / deliberate exclusions

No live-state plan has been run, so zero-diff import is not yet proven. Recheck metadata if
AWS changes before import. No resource ownership was added for S3, VPC/subnets/SGs, RDS,
Secrets Manager, subscriptions, AWS-managed policy contents, or service-linked roles.
The service-created StepFunctionsGetEventsForECSTaskRule remains unmanaged. Read-only
SNS topic attributes included aggregate subscription counters only; no subscription list
or personal endpoint was retrieved. EffectiveDeliveryPolicy is an AWS-computed default,
not an explicit DeliveryPolicy, so it is intentionally not configured. AWS counters, IDs,
timestamps and runtime status are not modeled. No ECR policy resources are created because
both queries returned NotFound. Tag queries confirmed only the ECS cluster has tags.

Exact AWS commands: [READ_ONLY_COMMANDS.md](READ_ONLY_COMMANDS.md). Findings and validation:
[README.md](README.md). Captured ASL/IAM/container/topic metadata: live_configuration.tf.json.

## Remaining IAM checkpoint (completed 2026-09-08)

The checkpoint began with 10 state instances. The exact declared addresses were:

```text
aws_iam_role_policy.etl["task/travel-dev-etl-task-rolePolicy"]
aws_iam_role.etl["execution"]
aws_iam_role_policy_attachment.etl["execution/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]
```

None was already present. One checksum-verified backup of both local state files was created
under `.terraform/state-backups/before-remaining-iam-imports-20260908-120727/`. Read-only IAM
inspection confirmed the live task policy, execution-role trust and attributes, and its one
AWS-managed execution-policy attachment. AWS provider 6.63.0 documentation confirmed the
attachment import identifier format `role_name/policy_arn`.

The following imports were executed in order, with `terraform state list` checked after each:

```text
terraform import 'aws_iam_role_policy.etl["task/travel-dev-etl-task-rolePolicy"]' 'travel-dev-etl-task-role:travel-dev-etl-task-rolePolicy'
terraform import 'aws_iam_role.etl["execution"]' 'travel-dev-etl-execution-role'
terraform import 'aws_iam_role_policy_attachment.etl["execution/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]' 'travel-dev-etl-execution-role/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
```

Each import succeeded and added only its intended address. State contains 13 instances after
the checkpoint. Separate targeted plans for all three addresses each returned detailed exit
code **0** and **No changes. Your infrastructure matches the configuration.** The IAM-focused
results contain **0 to add, 0 to change, 0 to destroy**; no reconciliation was needed.

The normalized task policy has no conditions and allows `s3:GetObject` on the raw prefix;
`s3:GetObject` and `s3:PutObject` on the processed prefix; and
`secretsmanager:GetSecretValue` on the exact ETL RDS secret ARN. The execution role trusts
`ecs-tasks.amazonaws.com` for `sts:AssumeRole`, uses path `/`, max session duration 3600,
description `Allows ECS tasks to call AWS services on your behalf.`, no permissions boundary,
and no tags. Its managed attachment is exactly
`arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`.

Only these three IAM resources were adopted. No apply or full plan ran; no AWS IAM setting or
other AWS resource changed; no ECS task or Step Functions execution started; and no secret
value was retrieved.

## Final Phase 1 import checkpoint (2026-09-08)

This checkpoint began with 14 state instances. One checksum-verified backup of both local
state files was created under
`.terraform/state-backups/before-final-phase1-imports-20260908-123854/`. Fresh read-only AWS
inspection confirmed the reconciled live state machine, EventBridge rule and target, and
CloudWatch alarm before import.

The following exact imports were executed in order, with state inspected after every command:

```text
terraform import aws_sfn_state_machine.pipeline arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline
terraform import aws_cloudwatch_event_rule.raw_created travel-dev-etl-raw-created
terraform import aws_cloudwatch_event_target.pipeline travel-dev-etl-raw-created/Idbfdbec94-dc0c-4eee-855a-222f4406c067
terraform import aws_cloudwatch_metric_alarm.execution_failed travel-dev-etl-execution-failed
```

All four imports succeeded and each added only its intended address. Phase 1 state now
contains all 18 declared resource instances. The EventBridge rule targeted plan returned 0
with no changes. State-machine, target, and alarm targeted plans returned 2 solely because
the state-machine dependency showed a semantically identical ASL serialization diff marked
`# whitespace changes`; neither the target nor alarm had its own diff.

The first full post-import plan returned detailed exit code **2** with
**Plan: 0 to add, 2 to change, 0 to destroy.** Both changes are in-place Terraform/provider
representation behavior: `+ skip_destroy = true` on the imported ECS task definition and
the state-machine definition serialization described above. There is no AWS attribute-value
change, replacement, ECS revision 2 registration, or destroy in the plan. No configuration
change was made: removing `skip_destroy` would discard an intentional safeguard, while
ignoring or freezing the state-machine definition would conceal future real ASL drift.

All Phase 1 imports are complete. Final zero-diff reconciliation remains pending explicit
review of these two non-replacement representation/state differences. No apply ran and no
AWS resource or execution was changed or started.

## ECS task-definition checkpoint (2026-09-08)

The checkpoint began with 13 state instances. The declared address
`aws_ecs_task_definition.etl` was absent. Both local state files were copied and verified with
SHA-256 checksums under
`.terraform/state-backups/before-ecs-task-definition-import-20260908-122707/`.

A fresh read-only `aws ecs describe-task-definition` for `travel-dev-etl:1` confirmed ARN
`arn:aws:ecs:us-east-1:954976315093:task-definition/travel-dev-etl:1`, FARGATE/awsvpc,
CPU 256, memory 512, Linux/X86_64, the expected task and execution roles, image, three named
environment variables, awslogs configuration, and empty volumes. AWS also returned computed
or default metadata: container CPU 0; empty port mappings, environment files, mount points,
volumes-from, ulimits, secret options and system controls; ACTIVE status; compatibility and
capability lists; registration metadata; and disabled fault injection. These already match
the reconciled configuration/provider representation and required no configuration change.

AWS provider 6.63.0 uses the existing task-definition ARN as the import identifier. Executed:

```text
terraform import aws_ecs_task_definition.etl arn:aws:ecs:us-east-1:954976315093:task-definition/travel-dev-etl:1
```

Import succeeded and added only this address, producing 14 state instances. State confirms
revision 1 and the live attributes above. The targeted plan's native detailed exit code is
**2**, with **Plan: 0 to add, 1 to change, 0 to destroy.** Its complete resource diff is:

```text
~ aws_ecs_task_definition.etl
    + skip_destroy = true
```

`skip_destroy` is provider/state lifecycle behavior, not a remotely readable ECS task
definition attribute. It is intentionally retained because it prevents deregistration during
an authorized future Terraform destroy. The plan classifies this as an in-place update; it
does not propose replacement or registration of a new task-definition revision. Achieving a
zero-diff plan without apply would require removing this deliberate safeguard, so no such
Terraform-only edit was made. A future apply of this exact plan would record the flag in
Terraform state; this checkpoint did not apply it. Review this single state-only diff before
any future apply.

No new revision was registered or deregistered, no ECS task ran, no full plan or apply ran,
no AWS resource changed, and no secret value was retrieved.
