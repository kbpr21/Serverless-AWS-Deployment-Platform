variable "aws_region" {
  description = "AWS region to deploy resources in"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "app_name" {
  description = "Base application name for resource prefixing"
  type        = string
  default     = "serverless-deployer"
}

variable "alert_email" {
  description = "Email address for build/deployment failure notifications (optional)"
  type        = string
  default     = ""
}

variable "budget_limit_usd" {
  description = "Monthly budget limit in USD to guard against unexpected spend"
  type        = number
  default     = 10
}

variable "codebuild_timeout_minutes" {
  description = "Hard timeout in minutes for ephemeral CodeBuild jobs"
  type        = number
  default     = 5
}

variable "paused" {
  description = "Temporary pause flag to halt all external traffic and billing without deleting resources"
  type        = bool
  default     = false
}

