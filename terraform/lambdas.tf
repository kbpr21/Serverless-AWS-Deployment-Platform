# Archive zip files for all Lambda functions
data "archive_file" "event_handler_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/event_handler/index.py"
  output_path = "${path.module}/.build/event_handler.zip"
}

data "archive_file" "upload_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/upload/index.py"
  output_path = "${path.module}/.build/upload.zip"
}

data "archive_file" "projects_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/projects/index.py"
  output_path = "${path.module}/.build/projects.zip"
}

data "archive_file" "logs_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/logs/index.py"
  output_path = "${path.module}/.build/logs.zip"
}

data "archive_file" "rollback_zip" {
  type        = "zip"
  source_file = "${path.module}/../lambda/rollback/index.py"
  output_path = "${path.module}/.build/rollback.zip"
}

# IAM Role for Lambda Functions
resource "aws_iam_role" "lambda_exec_role" {
  name = "${var.app_name}-lambda-exec-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.app_name}-lambda-policy-${var.environment}"
  role = aws_iam_role.lambda_exec_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "logs:GetLogEvents"
        ]
        Resource = "*"
      },
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.projects.arn,
          aws_dynamodb_table.deployments.arn,
          "${aws_dynamodb_table.deployments.arn}/*"
        ]
      },
      {
        Sid    = "S3Access"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:DeleteObject"
        ]
        Resource = [
          aws_s3_bucket.platform.arn,
          "${aws_s3_bucket.platform.arn}/*"
        ]
      },
      {
        Sid    = "CodeBuildStart"
        Effect = "Allow"
        Action = [
          "codebuild:StartBuild"
        ]
        Resource = aws_codebuild_project.builder.arn
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

# 1. Event Handler Lambda
resource "aws_lambda_function" "event_handler" {
  function_name    = "${var.app_name}-event-handler-${var.environment}"
  filename         = data.archive_file.event_handler_zip.output_path
  source_code_hash = data.archive_file.event_handler_zip.output_base64sha256
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.lambda_exec_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      PROJECTS_TABLE    = aws_dynamodb_table.projects.name
      DEPLOYMENTS_TABLE = aws_dynamodb_table.deployments.name
    }
  }
}

# 2. Upload / Build Trigger Lambda
resource "aws_lambda_function" "upload" {
  function_name    = "${var.app_name}-upload-${var.environment}"
  filename         = data.archive_file.upload_zip.output_path
  source_code_hash = data.archive_file.upload_zip.output_base64sha256
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.lambda_exec_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      PROJECTS_TABLE         = aws_dynamodb_table.projects.name
      DEPLOYMENTS_TABLE      = aws_dynamodb_table.deployments.name
      BUCKET_NAME            = aws_s3_bucket.platform.id
      CODEBUILD_PROJECT_NAME = aws_codebuild_project.builder.name
    }
  }
}

# 3. Projects & Deployment History Lambda
resource "aws_lambda_function" "projects" {
  function_name    = "${var.app_name}-projects-${var.environment}"
  filename         = data.archive_file.projects_zip.output_path
  source_code_hash = data.archive_file.projects_zip.output_base64sha256
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.lambda_exec_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      PROJECTS_TABLE     = aws_dynamodb_table.projects.name
      DEPLOYMENTS_TABLE  = aws_dynamodb_table.deployments.name
      BUCKET_NAME        = aws_s3_bucket.platform.id
      CLOUDFRONT_DIST_ID = aws_cloudfront_distribution.main.id
    }
  }
}

# 4. Logs Streaming Lambda
resource "aws_lambda_function" "logs" {
  function_name    = "${var.app_name}-logs-${var.environment}"
  filename         = data.archive_file.logs_zip.output_path
  source_code_hash = data.archive_file.logs_zip.output_base64sha256
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.lambda_exec_role.arn
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      DEPLOYMENTS_TABLE  = aws_dynamodb_table.deployments.name
      DEFAULT_LOG_GROUP  = aws_cloudwatch_log_group.codebuild.name
    }
  }
}

# 5. Rollback Lambda
resource "aws_lambda_function" "rollback" {
  function_name    = "${var.app_name}-rollback-${var.environment}"
  filename         = data.archive_file.rollback_zip.output_path
  source_code_hash = data.archive_file.rollback_zip.output_base64sha256
  runtime          = "python3.12"
  handler          = "index.handler"
  role             = aws_iam_role.lambda_exec_role.arn
  timeout          = 60
  memory_size      = 512

  environment {
    variables = {
      PROJECTS_TABLE     = aws_dynamodb_table.projects.name
      DEPLOYMENTS_TABLE  = aws_dynamodb_table.deployments.name
      BUCKET_NAME        = aws_s3_bucket.platform.id
      CLOUDFRONT_DIST_ID = aws_cloudfront_distribution.main.id
    }
  }
}
