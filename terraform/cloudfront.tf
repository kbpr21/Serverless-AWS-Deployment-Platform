# CloudFront Origin Access Control (OAC) for S3
resource "aws_cloudfront_origin_access_control" "s3_oac" {
  name                              = "${var.app_name}-s3-oac-${var.environment}"
  description                       = "OAC for Serverless Deploy Platform S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Function for SPA rewrites & subpath routing
resource "aws_cloudfront_function" "viewer_routing" {
  name    = "${var.app_name}-viewer-routing-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Rewrites subpath requests and handles SPA client routing"
  publish = true
  code    = file("${path.module}/../cloudfront/viewer_request.js")
}

# Main CloudFront Distribution
resource "aws_cloudfront_distribution" "main" {
  enabled             = !var.paused
  is_ipv6_enabled     = true
  comment             = "Serverless Build & Deployment Platform (${var.environment}) - ${var.paused ? "PAUSED" : "ACTIVE"}"
  price_class         = "PriceClass_100" # Lowest cost tier

  # Origin 1: S3 Platform Bucket
  origin {
    domain_name              = aws_s3_bucket.platform.bucket_regional_domain_name
    origin_id                = "S3Origin"
    origin_access_control_id = aws_cloudfront_origin_access_control.s3_oac.id
  }

  # Origin 2: API Gateway HTTP API
  origin {
    domain_name = replace(aws_apigatewayv2_api.http_api.api_endpoint, "https://", "")
    origin_id   = "ApiGatewayOrigin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Ordered Behavior: /api/* -> Direct to API Gateway (No Caching)
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "ApiGatewayOrigin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods  = ["GET", "HEAD"]

    # Managed CachingDisabled Policy
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # Managed AllViewerExceptHostHeader Policy
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }

  # Default Behavior: S3 Bucket (Dashboard & User Projects)
  default_cache_behavior {
    target_origin_id       = "S3Origin"
    viewer_protocol_policy = "redirect-to-https"

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    # Managed CachingOptimized Policy
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"

    # Managed SecurityHeadersPolicy (HSTS, nosniff, frame-options, XSS protection)
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_routing.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.app_name}-cdn"
  }
}

# S3 Bucket Policy allowing CloudFront OAC read access
resource "aws_s3_bucket_policy" "allow_cloudfront_oac" {
  bucket = aws_s3_bucket.platform.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipalReadOnly"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.platform.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}
