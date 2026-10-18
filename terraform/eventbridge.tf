# EventBridge Rule to capture all CodeBuild State Changes
resource "aws_cloudwatch_event_rule" "codebuild_state_change" {
  name        = "${var.app_name}-codebuild-state-${var.environment}"
  description = "Captures CodeBuild build state changes and updates DynamoDB"
  state       = var.paused ? "DISABLED" : "ENABLED"

  event_pattern = jsonencode({
    source      = ["aws.codebuild"]
    detail-type = ["CodeBuild Build State Change"]
    detail = {
      project-name = [aws_codebuild_project.builder.name]
    }
  })
}

# Target: Lambda Event Handler
resource "aws_cloudwatch_event_target" "lambda_event_handler" {
  rule      = aws_cloudwatch_event_rule.codebuild_state_change.name
  target_id = "SendToDynamoDBHandler"
  arn       = aws_lambda_function.event_handler.arn
}

resource "aws_lambda_permission" "allow_eventbridge_event_handler" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_handler.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.codebuild_state_change.arn
}

# EventBridge Rule specifically for FAILED / STOPPED builds -> SNS
resource "aws_cloudwatch_event_rule" "codebuild_failed" {
  name        = "${var.app_name}-codebuild-failed-${var.environment}"
  description = "Captures failed or stopped CodeBuild jobs and notifies SNS"
  state       = var.paused ? "DISABLED" : "ENABLED"

  event_pattern = jsonencode({
    source      = ["aws.codebuild"]
    detail-type = ["CodeBuild Build State Change"]
    detail = {
      project-name = [aws_codebuild_project.builder.name]
      build-status = ["FAILED", "STOPPED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "sns_failure_alert" {
  rule      = aws_cloudwatch_event_rule.codebuild_failed.name
  target_id = "SendToSNSFailureTopic"
  arn       = aws_sns_topic.build_failures.arn

  input_transformer {
    input_paths = {
      project = "$.detail.project-name"
      status  = "$.detail.build-status"
      phase   = "$.detail.current-phase"
      buildId = "$.detail.build-id"
    }
    input_template = "\"ALERT: CodeBuild project <project> experienced a failure! Build ID: <buildId>, Status: <status>, Phase: <phase>. Check CloudWatch and the platform dashboard for details.\""
  }
}

resource "aws_sns_topic_policy" "allow_eventbridge_publish" {
  arn = aws_sns_topic.build_failures.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowEventBridgePublish"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.build_failures.arn
      }
    ]
  })
}
