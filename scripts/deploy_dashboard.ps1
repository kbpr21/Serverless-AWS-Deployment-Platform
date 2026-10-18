# Build and deploy the Web Dashboard to the CloudFront S3 origin
$ErrorActionPreference = "Stop"

Write-Host "=== 1. Building Dashboard Web App ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\dashboard"
npm run build
Pop-Location

Write-Host "=== 2. Fetching Terraform Infrastructure Outputs ===" -ForegroundColor Cyan
Push-Location "$PSScriptRoot\..\terraform"
$tfOutputsRaw = terraform output -json | ConvertFrom-Json
Pop-Location

$bucketName = $tfOutputsRaw.s3_platform_bucket.value
$distId = $tfOutputsRaw.cloudfront_distribution_id.value
$dashboardUrl = $tfOutputsRaw.dashboard_url.value

if (-not $bucketName) {
  Write-Error "Could not retrieve s3_platform_bucket from terraform output. Has 'terraform apply' been run?"
}

Write-Host "Target S3 Bucket: $bucketName" -ForegroundColor Yellow
Write-Host "CloudFront ID:    $distId" -ForegroundColor Yellow

Write-Host "=== 3. Uploading Dashboard Bundle to S3 ===" -ForegroundColor Cyan
aws s3 sync "$PSScriptRoot\..\dashboard\dist" "s3://$bucketName/dashboard/" --delete --cache-control "public, max-age=0, must-revalidate"

Write-Host "=== 4. Invalidating CloudFront Cache ===" -ForegroundColor Cyan
aws cloudfront create-invalidation --distribution-id $distId --paths "/dashboard/*" "/"

Write-Host "=== Deployment Successful! ===" -ForegroundColor Green
Write-Host "Dashboard is live at: $dashboardUrl" -ForegroundColor Green
