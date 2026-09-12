variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "image_tag" {
  type    = string
  default = "2e950b8fabc4d6c9c7e948a13740b05c578b04af"
}

variable "container_name" {
  type        = string
  description = "Existing task container name, inspected live."
  default     = "travel-etl"
}

variable "event_target_id" {
  type        = string
  description = "Exact existing EventBridge target ID."
  default     = "Idbfdbec94-dc0c-4eee-855a-222f4406c067"
}

variable "raw_bucket" {
  type    = string
  default = "geospatial-learning-sergei-2026"
}

variable "vpc_id" {
  type    = string
  default = "vpc-09c598189d1fb892f"
}

variable "subnet_ids" {
  type    = list(string)
  default = ["subnet-03758b1f5545b9fd8", "subnet-0d400a6ca7d6db5c7"]
}

variable "security_group_ids" {
  type    = list(string)
  default = ["sg-06ee833ccc47678ba"]
}

variable "secret_id" {
  type    = string
  default = "travel/dev/rds/etl"
}

variable "web_image_tag" {
  type    = string
  default = "283e65fef402c28c492d45420ddc0bdfe27b2bd6"
}

variable "web_secret_arn" {
  type    = string
  default = "arn:aws:secretsmanager:us-east-1:954976315093:secret:travel/dev/web-QHuy98"
}

variable "rds_security_group_id" {
  type    = string
  default = "sg-0ec9eb56e2c29d03b"
}

