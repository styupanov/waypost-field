resource "aws_ecr_repository" "etl" {
  name                 = local.name
  image_tag_mutability = "MUTABLE"
  force_delete         = false
  encryption_configuration {
    encryption_type = "AES256"
  }
  image_scanning_configuration {
    scan_on_push = false
  }
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_repository" "web" {
  name                 = "travel-dev-web"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false

  encryption_configuration {
    encryption_type = "AES256"
  }

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    project     = "travel"
    component   = "web"
    environment = "dev"
  }
}
