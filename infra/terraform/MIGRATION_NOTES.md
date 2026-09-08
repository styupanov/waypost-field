# Local adoption checkpoints

## ETL task IAM role checkpoint (2026-09-08)

The exact address is `aws_iam_role.etl["task"]`. Formatting and validation passed; the
role and its standalone inline-policy address were absent from the nine-instance state.
AWS provider 6.63.0 documentation confirms an IAM role imports by role name.
Checksum-verified backups are under
`.terraform/state-backups/before-task-role-import-20260908-115803/`.

```text
terraform import 'aws_iam_role.etl["task"]' travel-dev-etl-task-role
```

Import succeeded and added only the task role. State confirms ARN
`arn:aws:iam::954976315093:role/travel-dev-etl-task-role`, path `/`, maximum session 3600,
description `Allows ECS tasks to call AWS services on your behalf.`, and no permissions
boundary or tags. Its trust policy semantically matches Terraform: Allow
`sts:AssumeRole` for `ecs-tasks.amazonaws.com`, empty Sid, version 2012-10-17.

The provider displays the existing nested inline policy while reading the role, but the
standalone address `aws_iam_role_policy.etl["task/travel-dev-etl-task-rolePolicy"]` remains
absent and was not imported. The task-role-targeted detailed plan returned **0**:
**No changes. Your infrastructure matches the configuration.** No additions and no
update/replacement of the role were proposed. No Terraform correction was needed. No other
import, apply, full plan, IAM/AWS change, ECS/Step Functions execution or secret retrieval
occurred.

## Step Functions inline-policy checkpoint (2026-09-08)

The exact address is
`aws_iam_role_policy.etl["stepfunctions/travel-dev-etl-stepfunctions-policy"]`; live policy
name `travel-dev-etl-stepfunctions-policy`. Formatting/validation passed and the policy was
absent from the eight-instance state. Read-only `list-role-policies` and `get-role-policy`
confirmed the live document. Semantic comparison against `live_configuration.tf.json`
passed for all Effects, Actions, Resources and the PassRole condition. Provider 6.63.0
documentation confirmed the `role_name:policy_name` import identifier.

Checksum-verified backups are under
`.terraform/state-backups/before-stepfunctions-policy-import-20260908-114754/`.

```text
terraform import 'aws_iam_role_policy.etl["stepfunctions/travel-dev-etl-stepfunctions-policy"]' travel-dev-etl-stepfunctions-role:travel-dev-etl-stepfunctions-policy
```

Import succeeded and added only this policy. The correctly quoted targeted plan returned
**2**: **Plan: 2 to add, 0 to change, 0 to destroy.** The additions are only the existing,
not-yet-imported `aws_iam_role.etl["execution"]` and `aws_iam_role.etl["task"]`, reached
through the shared dynamic IAM-role dependency. No change/replacement was proposed for the
Step Functions policy or role. No Terraform correction was warranted.

The policy preserves four Allow statements: RunTask on task-definition family `travel-dev-etl:*`;
DescribeTasks/StopTask on `*`; PassRole on the task/execution role ARNs conditioned by
`StringEquals iam:PassedToService = ecs-tasks.amazonaws.com`; and PutTargets/PutRule/
DescribeRule on `StepFunctionsGetEventsForECSTaskRule`. No hardening was performed.
No other import, trust/attachment change, apply, full plan, AWS mutation, ECS task,
Step Functions execution or secret retrieval occurred.

## Step Functions IAM role checkpoint (2026-09-08)

The declared address is `aws_iam_role.etl["stepfunctions"]`. Formatting and validation
passed. Initial state contained seven instances. The role and its standalone inline-policy
address were absent. Provider 6.63.0 documentation confirms role-name import syntax.

Checksum-verified backups are under
`.terraform/state-backups/before-stepfunctions-role-import-20260908-054011/`.

```text
terraform import 'aws_iam_role.etl["stepfunctions"]' travel-dev-etl-stepfunctions-role
```

Import succeeded and added only the Step Functions role. ARN:
`arn:aws:iam::954976315093:role/travel-dev-etl-stepfunctions-role`; path `/`;
max_session_duration 3600; description
`Allows Step Functions to access AWS resources on your behalf.`; no boundary or tags.
Parsed trust JSON matches configuration semantically: Allow `sts:AssumeRole` for
`states.amazonaws.com`, empty Sid, version 2012-10-17. Key ordering differs only.

The standalone inline-policy address
`aws_iam_role_policy.etl["stepfunctions/travel-dev-etl-stepfunctions-policy"]` remains absent.
The role-targeted detailed plan returned **0**: **No changes. Your infrastructure matches
the configuration.** No additions or role update/replacement appeared. No Terraform
correction, other import, apply, full plan, IAM/AWS mutation or secret retrieval occurred.

## Cluster-state provenance (inspected 2026-09-07)

Non-destructive inspection of local state and backup metadata found one continuous lineage.
Serial 2 contains only `aws_cloudwatch_log_group.etl` and `aws_ecr_repository.etl`.
The backup directory `before-ecs-cluster-import-20260907-111659` contains this serial-2 state.
Serial 3 additionally contains `aws_ecs_cluster.etl`; its preserved filesystem modification
time is **2026-09-07 11:18:18 local time (America/New_York)**. The serial-2 `.backup` and
serial-3 current file have nearly identical timestamps, consistent with a state write then.
The later `ecs-cluster-verification-20260907-160703` copies preserve those timestamps.

Thus the earliest available state evidence places the cluster addition at serial 3 around
11:18:18, before the later verification task began. State metadata cannot establish the
operator or exact command; filesystem timestamps are evidence, not a command audit trail.
No cluster removal or re-import was performed to investigate this discrepancy.

## Capacity-provider association checkpoint (2026-09-07)

Initial state: log group, ECR repository and ECS cluster only. Formatting and validation
passed. Declared address: `aws_ecs_cluster_capacity_providers.etl`; it was absent from state.
AWS provider v6.63.0 source documentation confirms import ID is the cluster name:
https://github.com/hashicorp/terraform-provider-aws/blob/v6.63.0/website/docs/r/ecs_cluster_capacity_providers.html.markdown

Before import, both local state files were copied and SHA-256 checksums compared successfully
under `.terraform/state-backups/before-capacity-providers-import-20260907-174759/`.
State contents and authentication values are not included in this document.

Executed once through Terraform 1.10.5 in Docker, with AWS provider 6.63.0:

```text
terraform import aws_ecs_cluster_capacity_providers.etl travel-dev-etl-cluster
```

Import succeeded. State now contains exactly:

```text
aws_cloudwatch_log_group.etl
aws_ecr_repository.etl
aws_ecs_cluster.etl
aws_ecs_cluster_capacity_providers.etl
```

`state show` confirmed cluster_name/id `travel-dev-etl-cluster`, region `us-east-1`,
capacity providers `FARGATE` and `FARGATE_SPOT`, and an empty default capacity-provider
strategy (no blocks). The ID is provider state bookkeeping; no new AWS resource was created.

Executed `terraform plan -target=aws_ecs_cluster_capacity_providers.etl -detailed-exitcode`.
The targeted plan refreshed the association and its existing cluster dependency only,
returned **0**, and reported **No changes. Your infrastructure matches the configuration.**
No Terraform resource configuration correction was required. Only this association was
imported; no apply, full plan, AWS resource mutation, ECS task run or secret-value retrieval
occurred. Repository changes for this checkpoint are migration documentation only.

## SNS topic checkpoint (2026-09-07)

The declared address is `aws_sns_topic.alerts`, not `aws_sns_topic.etl_alerts`.
Before this checkpoint the state contained only the four resources listed above.
Formatting and validation passed; the SNS topic was absent from state.
Both state files were backed up with matching SHA-256 checksums under
`.terraform/state-backups/before-sns-import-20260907-180625/`.

Read-only ARN confirmation (no subscription-list call):

```text
aws sns get-topic-attributes --topic-arn arn:aws:sns:us-east-1:954976315093:travel-dev-etl-alerts --profile travel-dev --region us-east-1 --query Attributes.TopicArn --output text
```

Executed exactly once via Terraform 1.10.5 / AWS provider 6.63.0:

```text
terraform import aws_sns_topic.alerts arn:aws:sns:us-east-1:954976315093:travel-dev-etl-alerts
```

Import succeeded. `state list` now contains those four resources plus `aws_sns_topic.alerts`.
`state show` confirmed name `travel-dev-etl-alerts`, the full ARN above, fifo_topic=false,
content_based_deduplication=false, kms_master_key_id=null, signature_version=0,
tracing_config=PassThrough, tags={}, and delivery_policy=null. The signature-version zero
is the provider's representation of an unset value, not an explicit signing configuration;
no override was introduced. Owner 954976315093 is computed metadata. The AWS effective
delivery defaults are not an explicitly configured delivery policy.

`terraform plan -target=aws_sns_topic.alerts -detailed-exitcode` returned **0**:
**No changes. Your infrastructure matches the configuration.**
No Terraform resource corrections were required. No full plan/apply, AWS resource changes,
message publishing or secret retrieval occurred. Only the SNS topic was imported.
Subscriptions, including the personal email subscription, remain intentionally unmanaged;
none were inspected, imported or modified.

## EventBridge IAM role checkpoint (completed 2026-09-08)

The exact declared address is `aws_iam_role.etl["eventbridge"]`. Initial state contained
the preceding five resources, with no IAM roles or standalone policies/attachments.
Formatting and validation passed. AWS provider 6.63.0 documentation confirmed role-name
import syntax. Checksum-verified backups of both state files are under
`.terraform/state-backups/before-eventbridge-role-import-20260907-181138/`.

```text
terraform import 'aws_iam_role.etl["eventbridge"]' travel-dev-etl-eventbridge-role
```

The first attempt failed authentication before importing (expired SSO, InvalidGrantException).
State remained at serial 5. Following user-completed SSO login, the same command succeeded.
Only that role address was added, giving six managed resource instances.

State confirms ARN `arn:aws:iam::954976315093:role/travel-dev-etl-eventbridge-role`, path `/`,
max_session_duration 3600, empty description, no permissions boundary and no tags.
Parsed trust JSON equals the configured JSON semantically: service principal
`events.amazonaws.com`, action `sts:AssumeRole`, effect Allow, version 2012-10-17.
Role IDs/create date are provider-computed metadata, not configuration changes.

The IAM role read also populates the existing inline policy in the role's computed state.
This is not an import of its separate `aws_iam_role_policy` resource. No inline_policy
configuration block or exclusive policy management was added; no standalone policy or
attachment addresses exist in state. The separate inline policy import remains pending.

`terraform plan -target='aws_iam_role.etl["eventbridge"]' -detailed-exitcode` returned **0**:
**No changes. Your infrastructure matches the configuration.**
No Terraform resource correction was needed. No other import, apply, full plan, trust change,
policy attachment/detachment, AWS resource mutation or secret retrieval occurred.

## EventBridge inline-policy checkpoint (2026-09-08)

Initial state contained the six preceding resource instances. Formatting and validation
passed. Read-only `aws iam list-role-policies` confirmed the exact name
`travel-dev-etl-eventbridge-rolePolicy`; `aws iam get-role-policy` confirmed its document.
Both commands used role `travel-dev-etl-eventbridge-role`, profile travel-dev and us-east-1.
Parsed JSON matched the Terraform document exactly, including Effect/Action/Resource and
absence of Conditions. Provider 6.63.0 documentation confirmed role_name:policy_name syntax.

Both local state files were backed up with matching SHA-256 checksums under
`.terraform/state-backups/before-eventbridge-policy-import-20260908-052711/`.

Executed successfully:

```text
terraform import 'aws_iam_role_policy.etl["eventbridge/travel-dev-etl-eventbridge-rolePolicy"]' travel-dev-etl-eventbridge-role:travel-dev-etl-eventbridge-rolePolicy
```

State now has seven instances: the previous six plus this inline-policy address. State show
confirmed role/name and a single Allow statement for states:StartExecution on
arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline,
Sid StartTravelEtlPipeline, Version 2012-10-17, with no conditions or other permissions.

The exact inline-policy-targeted plan returned **2**, with:
**Plan: 3 to add, 0 to change, 0 to destroy.**
There was no proposed change to the imported policy or EventBridge role. The proposed
creates were aws_iam_role.etl["execution"], aws_iam_role.etl["stepfunctions"], and
aws_iam_role.etl["task"]. The dynamic role reference
`aws_iam_role.etl[each.value.role].name` introduces a dependency on the shared role resource,
so targeting this policy also brings those unimported role instances into the plan.
This is partial-adoption graph expansion, not IAM permission drift or JSON normalization.

No Terraform resource correction is justified by the observed policy comparison. The role
dependency was not removed to manufacture a clean plan. A zero-exit-code targeted plan
remains unproven until subsequent separately authorized role adoption resolves these
dependency additions (or a separately reviewed configuration change is made).
Do not apply this plan. No other role/policy was imported, no trust or attachment changed,
no full plan/apply or AWS mutation occurred, and no secrets were retrieved.

## Remaining IAM resources checkpoint (2026-09-08)

This checkpoint started with 10 state instances and adopted only the task-role inline policy,
the ECS execution role, and the execution role's AWS-managed policy attachment. A single
checksum-verified pre-checkpoint backup of both local state files is stored under
`.terraform/state-backups/before-remaining-iam-imports-20260908-120727/`.

Read-only IAM calls confirmed task policy `travel-dev-etl-task-rolePolicy`, execution role
`travel-dev-etl-execution-role`, and its only managed attachment,
`arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`. The task policy has
the configured raw-prefix read, processed-prefix read/write, and exact ETL RDS secret-read
permissions, with no conditions. The execution role trusts `ecs-tasks.amazonaws.com` for
`sts:AssumeRole`; path `/`, maximum session duration 3600, description
`Allows ECS tasks to call AWS services on your behalf.`, no permissions boundary, and no tags
all match Terraform.

Executed successfully in the required order:

```text
terraform import 'aws_iam_role_policy.etl["task/travel-dev-etl-task-rolePolicy"]' 'travel-dev-etl-task-role:travel-dev-etl-task-rolePolicy'
terraform import 'aws_iam_role.etl["execution"]' 'travel-dev-etl-execution-role'
terraform import 'aws_iam_role_policy_attachment.etl["execution/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"]' 'travel-dev-etl-execution-role/arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy'
```

State was inspected after every import; each step added only its intended address. The final
state has 13 instances. `terraform fmt -check` and `terraform validate` passed. Individual
targeted plans for the task policy, execution role, and policy attachment each returned
detailed exit code **0**, reporting **No changes. Your infrastructure matches the
configuration.** Therefore the adopted IAM layer has 0 to add, 0 to change, and 0 to destroy.
No Terraform-only reconciliation was required.

No apply or full plan was executed. No AWS resource, IAM policy, attachment, or trust policy
was changed; no ECS task or Step Functions execution was started; no secret value was read.

## Final Phase 1 imports (2026-09-08)

Initial state count was 14. Checksum-verified backups of `terraform.tfstate` and its backup
were created at `.terraform/state-backups/before-final-phase1-imports-20260908-123854/`.
Read-only AWS inspection reconfirmed the live hardened STANDARD workflow, enabled default-bus
S3 rule, its single Step Functions target and input transformer, and the execution-failed
alarm with its SNS action.

Imported successfully, one at a time:

```text
terraform import aws_sfn_state_machine.pipeline arn:aws:states:us-east-1:954976315093:stateMachine:travel-dev-etl-pipeline
terraform import aws_cloudwatch_event_rule.raw_created travel-dev-etl-raw-created
terraform import aws_cloudwatch_event_target.pipeline travel-dev-etl-raw-created/Idbfdbec94-dc0c-4eee-855a-222f4406c067
terraform import aws_cloudwatch_metric_alarm.execution_failed travel-dev-etl-execution-failed
```

State counts advanced 14 to 15 to 16 to 17 to 18 with only the intended address added at
each checkpoint. Targeted plan results were: state machine 2 (ASL serialization only), rule
0 (no changes), target 2 (state-machine dependency serialization only), alarm 2
(state-machine dependency serialization only). No imported EventBridge or alarm resource
has its own proposed change.

Post-import `terraform fmt -check` and `terraform validate` passed. The first full plan's
native detailed exit code was **2** and summary was **Plan: 0 to add, 2 to change, 0 to
destroy.** It contains only two in-place differences:

```text
aws_ecs_task_definition.etl: + skip_destroy = true
aws_sfn_state_machine.pipeline: definition = jsonencode(...) # whitespace changes
```

The state-machine live ASL and Terraform ASL are semantically identical, including the six
states, sync ECS integrations, 900-second timeouts, retries, jitter, catches and failure
states. No replacement, new task-definition revision, AWS attribute modification or destroy
is proposed. Terraform was not weakened with removal of `skip_destroy`, and no
`ignore_changes` or frozen raw ASL string was added merely to suppress serialization output.

All 18 Phase 1 resources are adopted. Zero-diff reconciliation remains a separate review of
the two provider/state representation differences above. No apply, AWS mutation, ECS task,
Step Functions execution, SNS publication or secret-value retrieval occurred.

## ECS task definition revision 1 checkpoint (2026-09-08)

Starting state had 13 instances and did not contain `aws_ecs_task_definition.etl`.
`terraform fmt -check` and `terraform validate` passed. A checksum-verified backup of both
state files is under
`.terraform/state-backups/before-ecs-task-definition-import-20260908-122707/`.

Fresh read-only AWS inspection matched the reconciled Terraform task definition: family
`travel-dev-etl`, revision 1, FARGATE/awsvpc, CPU 256, memory 512, Linux/X86_64, expected
task/execution roles, `travel-etl` container, ECR `:dev` image, environment names
`AWS_REGION`, `RDS_SECRET_ID`, and `RDS_SSL_ROOT_CERT`, awslogs group/region/prefix, and no
volumes or port mappings. Verbose AWS defaults and computed registration/runtime metadata
were distinguished from authored configuration; no live setting needed reconciliation.

Executed successfully:

```text
terraform import aws_ecs_task_definition.etl arn:aws:ecs:us-east-1:954976315093:task-definition/travel-dev-etl:1
```

Only that address was added, bringing state to 14 instances. The targeted plan returned
native detailed exit code **2** and **Plan: 0 to add, 1 to change, 0 to destroy.** The only
diff is the provider/state flag `+ skip_destroy = true`; there is no remote task-definition
field diff, replacement, or proposed new revision. The configured safeguard was preserved
rather than deleted to manufacture exit code 0. No Terraform correction was made. A future
apply would record this state-only flag, but no apply occurred in this checkpoint.

No task-definition revision was registered or deregistered, no ECS task or Step Functions
execution started, no AWS resource changed, and no secret value was retrieved.

## Phase 1 finalization (2026-09-08)

Phase 1 Terraform adoption is complete with all 18 declared resource instances in state.
The final full plan has no creates, destroys, replacements, ECS revision registration, or
remote AWS attribute changes. Its only two plan lines are the known benign representations:

```text
aws_ecs_task_definition.etl: + skip_destroy = true
aws_sfn_state_machine.pipeline: definition JSON serialization/whitespace only
```

The repository intentionally keeps both protections visible: `skip_destroy` is not removed,
and state-machine `definition` remains drift-detectable rather than hidden with
`ignore_changes`. No destructive or replacement action is proposed, and no apply was run.
