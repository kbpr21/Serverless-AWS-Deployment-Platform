# Pauses the platform: disables CloudFront, throttles all 5 Lambdas to 0, disables EventBridge
# Nothing is deleted. All DynamoDB tables, S3 files, build logs, and code are 100% preserved.
$ErrorActionPreference = "Stop"

Write-Host "=== Pausing Serverless Platform to Halt All Billing ===" -ForegroundColor Yellow

# 1. Set Lambda reserved concurrency to 0 (hard stop on all Lambda compute)
Write-Host "1. Throttling all Lambda functions to 0 concurrency..." -ForegroundColor Cyan
$lambdas = @(
    "serverless-deployer-upload-dev",
    "serverless-deployer-projects-dev",
    "serverless-deployer-logs-dev",
    "serverless-deployer-rollback-dev",
    "serverless-deployer-event-handler-dev"
)
foreach ($fn in $lambdas) {
    aws lambda put-function-concurrency --function-name $fn --reserved-concurrent-executions 0 | Out-Null
}

# 2. Update Terraform to disable CloudFront edge and EventBridge rules
Write-Host "2. Updating Terraform state to pause CloudFront and EventBridge..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\terraform"

$tfVarsPath = "terraform.tfvars"
$content = Get-Content $tfVarsPath -Raw
if ($content -match 'paused\s*=\s*(true|false)') {
    $content = $content -replace 'paused\s*=\s*(true|false)', 'paused                    = true'
} else {
    $content = $content + "`npaused                    = true`n"
}
Set-Content -Path $tfVarsPath -Value $content

terraform apply -auto-approve

Write-Host "`n=== Platform is 100% PAUSED! ===" -ForegroundColor Green
Write-Host "• CloudFront Distribution: DISABLED (DNS withdrawn, zero edge transfer cost)"
Write-Host "• Lambda Compute: CONCURRENCY SET TO 0 (blocks all executions with HTTP 429, zero compute cost)"
Write-Host "• EventBridge Rules: DISABLED (no background event processing or alerts)"
Write-Host "• CodeBuild: IDLE ($0.00 cost when no builds are triggered)"
Write-Host "• DynamoDB / S3: PAY-PER-REQUEST & ON-DEMAND ($0.00 compute cost, all data intact)"
Write-Host "`nTo resume anytime, simply run: .\scripts\resume.ps1" -ForegroundColor Cyan

Pop-Location
