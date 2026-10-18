resource "aws_sns_topic" "build_failures" {
  name = "${var.app_name}-build-failures-${var.environment}"

  tags = {
    Name = "${var.app_name}-build-failures"
  }
}

resource "aws_sns_topic_subscription" "email_alert" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.build_failures.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
