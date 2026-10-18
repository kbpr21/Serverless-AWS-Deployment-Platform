resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "platform" {
  bucket        = "${var.app_name}-${var.environment}-${random_id.bucket_suffix.hex}"
  force_destroy = true # Allows easy cleanup for dev/testing workloads
}

resource "aws_s3_bucket_public_access_block" "platform" {
  bucket = aws_s3_bucket.platform.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "platform" {
  bucket = aws_s3_bucket.platform.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "platform" {
  bucket = aws_s3_bucket.platform.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Lifecycle rule to auto-clean raw uploaded source ZIPs after 14 days
resource "aws_s3_bucket_lifecycle_configuration" "platform" {
  bucket = aws_s3_bucket.platform.id

  rule {
    id     = "clean-source-archives"
    status = "Enabled"

    filter {
      prefix = "sources/"
    }

    expiration {
      days = 14
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}

# S3 CORS Configuration for direct browser Presigned URL uploads
resource "aws_s3_bucket_cors_configuration" "platform" {
  bucket = aws_s3_bucket.platform.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT", "GET", "HEAD"]
    allowed_origins = ["*"] # Can be restricted to CloudFront domain in prod
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}
