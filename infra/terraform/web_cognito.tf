resource "aws_cognito_user_pool" "web" {
  name = "travel-dev-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  tags = {
    project     = "travel"
    component   = "auth"
    environment = "dev"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "travel-dev-web"
  user_pool_id = aws_cognito_user_pool.web.id

  # Auth.js works as a confidential OAuth client.
  generate_secret = true

  allowed_oauth_flows_user_pool_client = true

  allowed_oauth_flows = [
    "code"
  ]

  allowed_oauth_scopes = [
    "openid",
    "email",
    "profile"
  ]

  supported_identity_providers = [
    "COGNITO"
  ]

  callback_urls = [
    "https://d37yaojl2iizl6.cloudfront.net/api/auth/callback/cognito"
  ]

  logout_urls = [
    "https://d37yaojl2iizl6.cloudfront.net"
  ]

  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = [
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  enable_token_revocation = true
}

resource "aws_cognito_user_pool_domain" "web" {
  domain       = "waypost-travel-dev"
  user_pool_id = aws_cognito_user_pool.web.id

  # Cognito Managed Login rather than the legacy Hosted UI.
  managed_login_version = 2
}

resource "aws_cognito_managed_login_branding" "web" {
  user_pool_id = aws_cognito_user_pool.web.id
  client_id    = aws_cognito_user_pool_client.web.id

  # Start with the Cognito default theme.
  # Later we can customize this for Waypost Premium.
  use_cognito_provided_values = true

  depends_on = [
    aws_cognito_user_pool_domain.web
  ]
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID for the Waypost web application."
  value       = aws_cognito_user_pool.web.id
}

output "cognito_client_id" {
  description = "Cognito app client ID for the Waypost web application."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_issuer" {
  description = "OIDC issuer URL used by Auth.js."
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.web.id}"
}

output "cognito_managed_login_domain" {
  description = "Cognito Managed Login domain."
  value       = "https://${aws_cognito_user_pool_domain.web.domain}.auth.${var.aws_region}.amazoncognito.com"
}