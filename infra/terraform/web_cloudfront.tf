data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewer"
}

resource "aws_cloudfront_distribution" "web" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Travel dev web HTTPS endpoint"

  origin {
    domain_name = aws_lb.web.dns_name
    origin_id   = "travel-dev-web-alb"

    custom_header {
      name  = "X-Waypost-Origin-Verify"
      value = random_password.web_origin_verify.result
    }

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id = "travel-dev-web-alb"

    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = [
      "DELETE",
      "GET",
      "HEAD",
      "OPTIONS",
      "PATCH",
      "POST",
      "PUT",
    ]

    cached_methods = [
      "GET",
      "HEAD",
      "OPTIONS",
    ]

    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id

    compress = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    project     = "travel"
    component   = "web"
    environment = "dev"
  }
}

output "web_cloudfront_domain_name" {
  description = "CloudFront HTTPS hostname for the web application"
  value       = aws_cloudfront_distribution.web.domain_name
}

output "web_cloudfront_url" {
  description = "CloudFront HTTPS URL for the web application"
  value       = "https://${aws_cloudfront_distribution.web.domain_name}"
}