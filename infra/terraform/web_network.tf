resource "aws_security_group" "web_alb" {
  name        = "travel-dev-web-alb-sg"
  description = "Internet-facing ALB for the Waypost dev web service"
  vpc_id      = var.vpc_id
  tags        = { project = "travel", component = "web", environment = "dev" }
}

resource "aws_security_group" "web_task" {
  name        = "travel-dev-web-task-sg"
  description = "Fargate tasks for the Waypost dev web service"
  vpc_id      = var.vpc_id
  tags        = { project = "travel", component = "web", environment = "dev" }
}

data "aws_ec2_managed_prefix_list" "cloudfront_origin_facing" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "web_alb_http_cloudfront" {
  security_group_id = aws_security_group.web_alb.id

  ip_protocol = "tcp"
  from_port   = 80
  to_port     = 80

  prefix_list_id = data.aws_ec2_managed_prefix_list.cloudfront_origin_facing.id

  description = "HTTP from CloudFront origin-facing servers"
}

resource "aws_vpc_security_group_egress_rule" "web_alb_to_task" {
  security_group_id            = aws_security_group.web_alb.id
  description                  = "Forward ALB traffic to Waypost web tasks"
  referenced_security_group_id = aws_security_group.web_task.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "web_task_from_alb" {
  security_group_id            = aws_security_group.web_task.id
  description                  = "Accept application traffic only from the web ALB"
  referenced_security_group_id = aws_security_group.web_alb.id
  from_port                    = 3000
  to_port                      = 3000
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "web_task_outbound" {
  security_group_id = aws_security_group.web_task.id
  description       = "Reach RDS, AWS APIs, and external routing providers"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_vpc_security_group_ingress_rule" "rds_from_web_task" {
  security_group_id            = var.rds_security_group_id
  description                  = "PostgreSQL from Waypost web tasks"
  referenced_security_group_id = aws_security_group.web_task.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}
