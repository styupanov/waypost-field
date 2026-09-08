provider "aws" {
  region              = var.aws_region
  allowed_account_ids = ["954976315093"]
  # Default credential chain; set AWS_PROFILE externally for local SSO.
  # No default_tags: do not introduce tagging drift during adoption.
}
