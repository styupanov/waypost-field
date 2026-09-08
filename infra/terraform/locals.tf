locals {
  name       = "travel-dev-etl"
  account_id = "954976315093"
  role_names = {
    task          = "travel-dev-etl-task-role"
    execution     = "travel-dev-etl-execution-role"
    stepfunctions = "travel-dev-etl-stepfunctions-role"
    eventbridge   = "travel-dev-etl-eventbridge-role"
  }
  inline_policies = merge([for role, config in local.role_configuration : {
    for name, policy in config.inline_policies : "${role}/${name}" => {
      role   = role
      name   = name
      policy = policy
    }
  }]...)
  attachments = merge([for role, config in local.role_configuration : {
    for arn in config.managed_policy_arns : "${role}/${arn}" => {
      role = role
      arn  = arn
    }
  }]...)
}
