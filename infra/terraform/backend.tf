terraform {
  backend "s3" {
    bucket       = "waypost-terraform-state-954976315093-us-east-1"
    key          = "travel/dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}