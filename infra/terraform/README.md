# Phase 1: reconciled existing AWS ETL infrastructure

Read-only reconciliation completed on 2026-09-07, account **954976315093**, region
**us-east-1**, profile **travel-dev**. No AWS resource writes, executions, task launches,
secret-value reads, subscription-list requests, Terraform plans, imports or applies occurred.
Next.js and Python ETL behavior are unchanged.

## Configuration and observed differences

`live_configuration.tf.json` is Terraform JSON syntax defining locals. It contains the
exact live ASL object, container baseline, IAM trust/inline policies and attachment ARNs,
SNS topic policy and EventBridge input template. It contains configuration metadata only,
not credentials or execution payloads. Terraform jsonencode serializes the live ASL;
the earlier `workflow.example.tfvars` is a historical illustration and is never loaded.
Do not pass that example as a var-file. No required private inputs remain; defaults match
inspection. Remove obsolete role_configuration/workflow_definition overrides from any
private tfvars before future imports: those are now versioned locals, not variables.

| Resource | Observed / reconciled settings |
| --- | --- |
| ECR | MUTABLE, AES256, scanOnPush=false; no repository policy, lifecycle policy or tags. Encryption/scanning were implicit in the original scaffold. |
| ECS cluster | containerInsights disabled; execute-command logging DEFAULT; project=travel, component=etl, environment=dev tags; FARGATE and FARGATE_SPOT associations with empty default strategy. Tags/settings/association were missing. |
| ECS task | Latest ACTIVE family lookup returned travel-dev-etl:1, also referenced by both live workflow tasks. Container travel-etl; expected image dev, Fargate/awsvpc, 256/512, Linux/X86_64. All returned container defaults preserved, including cpu=0 and empty arrays. |
| Step Functions | Exact six-state ASL captured; STANDARD, logging OFF, tracing false, AWS_OWNED_KEY. Each task has 900-second timeout; AmazonECS.Unknown retry 5s/2 attempts/backoff2/FULL jitter, States.Timeout 10s/1/backoff2, States.TaskFailed 10s/2/backoff2/FULL jitter. States.ALL catches route to named Fail states with exact Causes. Earlier illustrative ASL differed in input handling, retries, timeouts and failure causes. |
| EventBridge | Default bus, ENABLED, original event pattern confirmed; target Idbfdbec94-dc0c-4eee-855a-222f4406c067. Exact multiline transformer captured, with no trailing newline; original scaffold used different whitespace. No explicit target retry/DLQ. |
| Logs | /ecs/travel-dev-etl, retention 7, STANDARD, no KMS or tags. |
| Alarm | Original metric settings confirmed; actions enabled, SNS alarm action, empty OK/insufficient-data actions. |
| SNS | Default account-owner policy captured; PassThrough tracing; no explicit KMS or delivery policy. No tags. |

Live task `command`, `entryPoint`, `user`, `readonlyRootFilesystem` and ephemeral storage
are absent. They stay absent: Docker image defaults must not be turned into ECS overrides.
AWS registration metadata, capabilities, runtime counters and timestamps stay computed.
SNS EffectiveDeliveryPolicy is a computed service default and remains omitted. No personal
email endpoint was inspected: get-topic-attributes returns aggregate counts only.

## IAM reconciliation

Four role trust policies exactly match the service principals: ECS tasks (task/execution),
Step Functions, and EventBridge. Descriptions, empty Sids where present, path `/`, 3600-second
sessions and absent boundaries are preserved. No role tags were returned.

- Task inline policy **travel-dev-etl-task-rolePolicy**: GetObject on bucket raw/*;
  GetObject/PutObject on processed/*; GetSecretValue on the exact secret ARN ending
  `travel/dev/rds/etl-stIWJB`. No value was retrieved.
- Execution: no inline policy. One attachment to AWS-managed
  `arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`, default version v1.
  Its ECR/log actions and wildcard Resource were inspected; policy contents remain AWS-owned.
- Step Functions inline **travel-dev-etl-stepfunctions-policy**: RunTask on family revisions,
  DescribeTasks/StopTask Resource `*`, PassRole on the two ECS roles with
  iam:PassedToService=ecs-tasks.amazonaws.com, and events permissions on
  StepFunctionsGetEventsForECSTaskRule.
- EventBridge inline **travel-dev-etl-eventbridge-rolePolicy**: StartExecution on this workflow.

The current trust policies have no source-account/ARN conditions. Task S3 scope is raw/* and
processed/*, broader than routing/here only. These and the Step Functions wildcard task
management permission are preserved for adoption, not silently tightened. Any least-privilege
improvements require a separate authorization. No extra grants or exclusive attachment
resources are introduced. No customer-managed policy resource was discovered.

## Ownership and safety

18 resource instances are represented: repository, cluster and capacity-provider association,
task definition, four roles, three inline policies, one managed attachment, workflow,
EventBridge rule/target, log group, alarm and SNS topic. The cluster association is the only
additional resource block discovered; it manages existing associations, not provider creation.

Unmanaged: S3 and its EventBridge notification setting, networking, RDS, Secrets Manager,
SNS subscriptions, service-linked roles, AWS-managed policy contents, service-created ECS
sync rule, ECS services, images/build/push and remote state. Network variable defaults are
inventory references; exact captured ASL remains authoritative for subnets, SGs, public IP
ENABLED, task revision and commands. The workflow stays pinned to revision 1 even if a
future image_tag change creates a task revision; advancing it is a separate deployment.

`prevent_destroy` guards replacement/deletion but does not prevent in-place changes.
`skip_destroy` protects task revisions from deregistration. Neither is a no-drift guarantee.
Never remove guards or add broad ignore_changes merely to hide an import diff.

## Tooling and validation

Terraform constraint **>= 1.10.0, < 2.0.0**; AWS provider **~> 6.0**. Terraform 1.10.5 ran
in Docker with only this directory mounted and no AWS credentials. Authorized
`terraform init -backend=false -input=false` succeeded, selecting signed AWS provider
**6.63.0**. Commit `.terraform.lock.hcl`. `terraform fmt -recursive` and
`terraform validate` passed, the latter with network disabled. Offline JSON comparisons
confirmed exact captured ASL, container baseline, policies/attachments and transformer.
Phase 1 is complete: all 18 declared resource instances are adopted in local Terraform
state and were compared with live AWS.

For installed Terraform, from infra/terraform:

```powershell
$env:AWS_PROFILE = "travel-dev"
terraform init
terraform fmt -check -recursive
terraform validate
# Later, only after separate authorization and following IMPORT_PLAN.md:
# terraform import <one-address> <one-id>
# terraform plan
```

Init/provider downloads modify local files only. There is no remote backend. State, provider
cache, private tfvars and plans are ignored; treat local state/backups as sensitive and use
one operator. A reviewed S3 backend and state locking are a future step, not provisioned here.
The provider guard restricts account 954976315093 and gets region/credentials through normal
configuration; AWS_PROFILE is not hardcoded in provider code.

## Phase 1 adoption status

All 18 resources in the [import plan](IMPORT_PLAN.md) are imported. The first complete plan
reported **0 to add, 2 to change, 0 to destroy**. Both remaining diffs are benign local or
serialization behavior:

- `aws_ecs_task_definition.etl`: `skip_destroy = true` is recorded in configuration but is
  not a remotely readable ECS task-definition attribute.
- `aws_sfn_state_machine.pipeline`: the provider reports JSON serialization/whitespace only;
  the decoded live and configured ASL documents are semantically identical.

Neither diff proposes replacement, task-definition revision 2, an AWS attribute change, or
destruction. Do not remove `skip_destroy`, freeze the ASL as an opaque string, or add broad
`ignore_changes` merely to suppress these plan lines. No apply was performed during adoption.

[READ_ONLY_COMMANDS.md](READ_ONLY_COMMANDS.md) records every AWS CLI command executed.

## Glue analytics catalog

Terraform now manages the existing Glue catalog database `travel_analytics` and external
table `travel_analytics.routes`. The table reads route-level GeoParquet from
`s3://geospatial-learning-sergei-2026/analytics/routing/routes/` and exposes `geometry` to
Athena as binary WKB. Spatial SQL can construct geometry with
`ST_GeomFromBinary(geometry)`.

The table uses projected `year`, `month`, and `day` partitions. Individual partitions are
not Terraform resources, and projected future dates require no `MSCK REPAIR TABLE`. The
GeoParquet files themselves remain S3 application data outside Terraform ownership.
