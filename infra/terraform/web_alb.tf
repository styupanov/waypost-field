resource "aws_lb" "web" {
  name               = "travel-dev-web-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.web_alb.id]
  subnets            = var.subnet_ids
  tags               = { project = "travel", component = "web", environment = "dev" }
}

resource "aws_lb_target_group" "web" {
  name                 = "travel-dev-web"
  port                 = 3000
  protocol             = "HTTP"
  protocol_version     = "HTTP1"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/api/health"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  tags = { project = "travel", component = "web", environment = "dev" }
}

resource "aws_lb_listener" "web_http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Forbidden"
      status_code  = "403"
    }
  }

  tags = {
    project     = "travel"
    component   = "web"
    environment = "dev"
  }
}

resource "aws_lb_listener_rule" "web_cloudfront_origin" {
  listener_arn = aws_lb_listener.web_http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    http_header {
      http_header_name = "X-Waypost-Origin-Verify"
      values = [
        random_password.web_origin_verify.result
      ]
    }
  }

  tags = {
    project     = "travel"
    component   = "web"
    environment = "dev"
  }
}
