resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${var.app_name}-builder-${var.environment}"
  retention_in_days = 14
}

resource "aws_iam_role" "codebuild_role" {
  name = "${var.app_name}-codebuild-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "codebuild.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "codebuild_policy" {
  name = "${var.app_name}-codebuild-policy-${var.environment}"
  role = aws_iam_role.codebuild_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = [
          aws_cloudwatch_log_group.codebuild.arn,
          "${aws_cloudwatch_log_group.codebuild.arn}:*"
        ]
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:PutObjectAcl",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.platform.arn,
          "${aws_s3_bucket.platform.arn}/*"
        ]
      },
      {
        Sid    = "CloudFrontInvalidation"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_codebuild_project" "builder" {
  name          = "${var.app_name}-builder-${var.environment}"
  description   = "Serverless Ephemeral Builder for Static Web & SPAs"
  build_timeout = var.codebuild_timeout_minutes
  service_role  = aws_iam_role.codebuild_role.arn

  artifacts {
    type = "NO_ARTIFACTS"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "BUCKET_NAME"
      value = aws_s3_bucket.platform.id
    }

    environment_variable {
      name  = "CLOUDFRONT_DIST_ID"
      value = aws_cloudfront_distribution.main.id
    }
  }

  source {
    type      = "NO_SOURCE"
    buildspec = file("${path.module}/../buildspec/buildspec.yml")
  }

  logs_config {
    cloudwatch_logs {
      status     = "ENABLED"
      group_name = aws_cloudwatch_log_group.codebuild.name
    }
  }

  tags = {
    Name = "${var.app_name}-builder"
  }
}
