output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "dashboard_url" {
  description = "Public URL for the serverless deployment dashboard"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}/"
}

output "api_gateway_endpoint" {
  description = "Direct endpoint of the HTTP API Gateway"
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

output "s3_platform_bucket" {
  description = "S3 bucket storing sources, artifacts, and hosted assets"
  value       = aws_s3_bucket.platform.id
}

output "codebuild_project_name" {
  description = "Name of the CodeBuild builder project"
  value       = aws_codebuild_project.builder.name
}

output "sns_failure_topic_arn" {
  description = "ARN of the SNS topic for build failure alerts"
  value       = aws_sns_topic.build_failures.arn
}

output "dynamodb_projects_table" {
  description = "DynamoDB table for project metadata"
  value       = aws_dynamodb_table.projects.name
}

output "dynamodb_deployments_table" {
  description = "DynamoDB table for deployment history"
  value       = aws_dynamodb_table.deployments.name
}
