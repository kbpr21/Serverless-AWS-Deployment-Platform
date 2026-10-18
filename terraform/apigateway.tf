resource "aws_apigatewayv2_api" "http_api" {
  name          = "${var.app_name}-api-${var.environment}"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["*"]
    allow_methods     = ["GET", "POST", "OPTIONS", "DELETE"]
    allow_origins     = ["*"]
    max_age           = 3600
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = var.paused ? 0 : 5000
    throttling_rate_limit  = var.paused ? 0 : 10000
  }
}

# --- Integrations ---
resource "aws_apigatewayv2_integration" "upload" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.upload.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "projects" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.projects.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "logs" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.logs.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "rollback" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.rollback.invoke_arn
  payload_format_version = "2.0"
}

# --- Routes ---
# 1. Upload & Start Build
resource "aws_apigatewayv2_route" "post_upload" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /api/upload"
  target    = "integrations/${aws_apigatewayv2_integration.upload.id}"
}

resource "aws_apigatewayv2_route" "post_builds_start" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /api/builds/start"
  target    = "integrations/${aws_apigatewayv2_integration.upload.id}"
}

# 2. Projects & Deployments
resource "aws_apigatewayv2_route" "get_projects" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/projects"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
}

resource "aws_apigatewayv2_route" "get_project_detail" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/projects/{projectId}"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
}

resource "aws_apigatewayv2_route" "delete_project" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "DELETE /api/projects/{projectId}"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
}

# 3. Logs
resource "aws_apigatewayv2_route" "get_logs" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "GET /api/projects/{projectId}/builds/{buildId}/logs"
  target    = "integrations/${aws_apigatewayv2_integration.logs.id}"
}

# 4. Rollback
resource "aws_apigatewayv2_route" "post_rollback" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "POST /api/projects/{projectId}/rollback"
  target    = "integrations/${aws_apigatewayv2_integration.rollback.id}"
}

# --- Lambda Invocation Permissions ---
resource "aws_lambda_permission" "apigw_upload" {
  statement_id  = "AllowAPIGatewayUpload"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_projects" {
  statement_id  = "AllowAPIGatewayProjects"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.projects.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_logs" {
  statement_id  = "AllowAPIGatewayLogs"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.logs.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "apigw_rollback" {
  statement_id  = "AllowAPIGatewayRollback"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rollback.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
