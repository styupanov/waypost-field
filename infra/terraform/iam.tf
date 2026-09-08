# Capture existing policies before importing; never replace scoped IAM with guessed grants.
# No exclusive policy attachment resources and no service-linked roles.
resource "aws_iam_role" "etl" {
  for_each             = local.role_names
  name                 = each.value
  assume_role_policy   = local.role_configuration[each.key].assume_role_policy
  path                 = local.role_configuration[each.key].path
  description          = local.role_configuration[each.key].description
  max_session_duration = local.role_configuration[each.key].max_session_duration
  permissions_boundary = local.role_configuration[each.key].permissions_boundary
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy" "etl" {
  for_each = local.inline_policies
  name     = each.value.name
  role     = aws_iam_role.etl[each.value.role].name
  policy   = each.value.policy
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_iam_role_policy_attachment" "etl" {
  for_each   = local.attachments
  role       = aws_iam_role.etl[each.value.role].name
  policy_arn = each.value.arn
  lifecycle {
    prevent_destroy = true
  }
}
