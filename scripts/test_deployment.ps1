# Automated End-to-End Test for Project Deployment
param(
  [string]$ProjectId = "demo-static-site",
  [string]$ZipPath = "$PSScriptRoot\..\samples\static-html.zip"
)

$ErrorActionPreference = "Stop"

$apiBase = "https://d3fc5bcr2q3els.cloudfront.net/api"

Write-Host "=== 1. Requesting S3 Presigned Upload URL ===" -ForegroundColor Cyan
$uploadReqBody = @{
  projectId = $ProjectId
  projectName = "Demo Static Site"
} | ConvertTo-Json

$uploadRes = Invoke-RestMethod -Uri "$apiBase/upload" -Method POST -Body $uploadReqBody -ContentType "application/json"
$buildId = $uploadRes.buildId
$presignedUrl = $uploadRes.uploadUrl

Write-Host "Project ID: $ProjectId" -ForegroundColor Green
Write-Host "Build ID:   $buildId" -ForegroundColor Green

Write-Host "=== 2. Uploading ZIP Archive to S3 via Presigned URL ===" -ForegroundColor Cyan
$fileBytes = [System.IO.File]::ReadAllBytes($ZipPath)
$uploadHttpReq = [System.Net.HttpWebRequest]::Create($presignedUrl)
$uploadHttpReq.Method = "PUT"
$uploadHttpReq.ContentType = "application/zip"
$uploadHttpReq.ContentLength = $fileBytes.Length
$reqStream = $uploadHttpReq.GetRequestStream()
$reqStream.Write($fileBytes, 0, $fileBytes.Length)
$reqStream.Close()
$uploadHttpRes = $uploadHttpReq.GetResponse()
Write-Host "Upload Status: $($uploadHttpRes.StatusCode)" -ForegroundColor Green
$uploadHttpRes.Close()

Write-Host "=== 3. Starting CodeBuild Job ===" -ForegroundColor Cyan
$startReqBody = @{
  projectId = $ProjectId
  buildId = $buildId
} | ConvertTo-Json

$startRes = Invoke-RestMethod -Uri "$apiBase/builds/start" -Method POST -Body $startReqBody -ContentType "application/json"
Write-Host "CodeBuild ID: $($startRes.codeBuildId)" -ForegroundColor Green

Write-Host "=== 4. Polling Deployment Status & Streaming Logs ===" -ForegroundColor Cyan
$completed = $false
$maxRetries = 40
$retryCount = 0

while (-not $completed -and $retryCount -lt $maxRetries) {
  Start-Sleep -Seconds 5
  $retryCount++

  try {
    $logsRes = Invoke-RestMethod -Uri "$apiBase/projects/$ProjectId/builds/$buildId/logs" -Method GET
    $currentStatus = $logsRes.status

    Write-Host "[$retryCount] Current Status: $currentStatus" -ForegroundColor Yellow

    if ($logsRes.events -and $logsRes.events.Count -gt 0) {
      $lastMsg = $logsRes.events[-1].message.Trim()
      Write-Host "    Log: $lastMsg" -ForegroundColor DarkGray
    }

    if ($currentStatus -in @("SUCCEEDED", "FAILED", "STOPPED")) {
      $completed = $true
      if ($currentStatus -eq "SUCCEEDED") {
        Write-Host "=== Deployment SUCCEEDED! ===" -ForegroundColor Green
        Write-Host "Live Project URL: https://d3fc5bcr2q3els.cloudfront.net/projects/$ProjectId/live/" -ForegroundColor Cyan
      } else {
        Write-Error "Deployment ended with status: $currentStatus"
      }
    }
  } catch {
    Write-Host "Waiting for logs... ($($_.Exception.Message))" -ForegroundColor DarkGray
  }
}
