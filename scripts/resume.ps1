# Resumes the platform: re-enables CloudFront, removes Lambda concurrency limits, re-enables EventBridge
$ErrorActionPreference = "Stop"

Write-Host "=== Resuming Serverless Platform ===" -ForegroundColor Cyan

# 1. Remove concurrency limits on all 5 Lambdas
Write-Host "1. Unthrottling all Lambda functions..." -ForegroundColor Cyan
$lambdas = @(
    "serverless-deployer-upload-dev",
    "serverless-deployer-projects-dev",
    "serverless-deployer-logs-dev",
    "serverless-deployer-rollback-dev",
    "serverless-deployer-event-handler-dev"
)
foreach ($fn in $lambdas) {
    aws lambda delete-function-concurrency --function-name $fn 2>$null | Out-Null
}

# 2. Update Terraform to re-enable CloudFront and EventBridge
Write-Host "2. Updating Terraform to re-enable CloudFront and EventBridge..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\terraform"

$tfVarsPath = "terraform.tfvars"
$content = Get-Content $tfVarsPath -Raw
if ($content -match 'paused\s*=\s*(true|false)') {
    $content = $content -replace 'paused\s*=\s*(true|false)', 'paused                    = false'
} else {
    $content = $content + "`npaused                    = false`n"
}
Set-Content -Path $tfVarsPath -Value $content

terraform apply -auto-approve

Write-Host "`n=== Platform is RESUMED and ACTIVE! ===" -ForegroundColor Green
Write-Host "Dashboard: https://d3fc5bcr2q3els.cloudfront.net/" -ForegroundColor Green

Pop-Location
