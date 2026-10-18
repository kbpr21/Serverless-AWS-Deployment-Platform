resource "aws_dynamodb_table" "projects" {
  name         = "${var.app_name}-projects-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "projectId"

  attribute {
    name = "projectId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.app_name}-projects"
  }
}

resource "aws_dynamodb_table" "deployments" {
  name         = "${var.app_name}-deployments-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "projectId"
  range_key    = "buildId"

  attribute {
    name = "projectId"
    type = "S"
  }

  attribute {
    name = "buildId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.app_name}-deployments"
  }
}
