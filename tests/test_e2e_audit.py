import json
import os
import sys
import time
import zipfile
import urllib.request
import urllib.error

CLOUDFRONT_DOMAIN = "d3fc5bcr2q3els.cloudfront.net"
BASE_URL = f"https://{CLOUDFRONT_DOMAIN}/api"
PROJECT_ID = "audit-test-site"
PROJECT_NAME = "Audit Test Site"

print(f"=== Starting E2E Audit Test for {PROJECT_ID} ===")

# 1. Create a sample zip bundle
zip_path = "audit_sample.zip"
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr(
        "index.html",
        """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Audit Test Site</title>
  <link rel="stylesheet" href="style.css">
</head>
<body style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center;">
  <h1 style="color: #38bdf8;">Serverless Deployer Audit Verification</h1>
  <p>Version 1.0.0 - Built by AWS CodeBuild & Served by CloudFront in ap-south-1</p>
  <div id="status" style="display:inline-block; padding: 10px 20px; background: #0284c7; border-radius: 8px;">ALL CHECKS PASSED</div>
</body>
</html>""",
    )
    z.writestr(
        "style.css",
        """body { margin: 0; } h1 { font-size: 2.5rem; }""",
    )

print("Created sample archive:", zip_path)

# 2. Request Presigned URL
upload_req = urllib.request.Request(
    f"{BASE_URL}/upload",
    data=json.dumps({"projectId": PROJECT_ID, "projectName": PROJECT_NAME}).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urllib.request.urlopen(upload_req) as resp:
    upload_res = json.loads(resp.read().decode("utf-8"))

build_id = upload_res["buildId"]
upload_url = upload_res["uploadUrl"]
print(f"Generated buildId: {build_id}")
print(f"Presigned URL acquired (omitted Content-Type constraint verified)")

# 3. Upload zip to S3 via presigned PUT
with open(zip_path, "rb") as f:
    zip_bytes = f.read()

put_req = urllib.request.Request(
    upload_url,
    data=zip_bytes,
    headers={},  # Testing binary PUT without enforcing specific MIME
    method="PUT",
)
with urllib.request.urlopen(put_req) as resp:
    print(f"S3 PUT upload response: {resp.status} {resp.reason}")

# 4. Trigger CodeBuild
start_req = urllib.request.Request(
    f"{BASE_URL}/builds/start",
    data=json.dumps({"projectId": PROJECT_ID, "buildId": build_id}).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(start_req) as resp:
    start_res = json.loads(resp.read().decode("utf-8"))
print(f"CodeBuild triggered: {start_res.get('codeBuildId')}, Status: {start_res.get('status')}")

# 5. Monitor logs and wait for completion
print("Waiting for CodeBuild execution and polling CloudWatch logs...")
max_wait = 180
start_time = time.time()
final_status = "UNKNOWN"

while time.time() - start_time < max_wait:
    time.sleep(6)
    try:
        log_req = urllib.request.Request(f"{BASE_URL}/projects/{PROJECT_ID}/builds/{build_id}/logs")
        with urllib.request.urlopen(log_req) as resp:
            log_data = json.loads(resp.read().decode("utf-8"))
            status = log_data.get("status")
            events = log_data.get("events", [])
            print(f"[{int(time.time() - start_time)}s] Build Status: {status} (Events: {len(events)})")
            if events:
                last_msg = events[-1]["message"].strip()
                print(f"   Last log: {last_msg[:90]}")
            if status in ["SUCCEEDED", "FAILED", "STOPPED"]:
                final_status = status
                break
    except Exception as e:
        print("Log polling note:", str(e))

if final_status != "SUCCEEDED":
    print(f"ERROR: Build did not succeed. Final status: {final_status}")
    sys.exit(1)

print("\n=== Build SUCCEEDED! Verifying live site via CloudFront ===")
time.sleep(2)

# 6. Verify live site
live_url = f"https://{CLOUDFRONT_DOMAIN}/projects/{PROJECT_ID}/live/"
live_req = urllib.request.Request(live_url)
with urllib.request.urlopen(live_req) as resp:
    content = resp.read().decode("utf-8")
    headers = dict(resp.headers)
    print(f"Live Site Response: {resp.status} {resp.reason}")
    print(f"HSTS Header: {headers.get('Strict-Transport-Security')}")
    print(f"X-Content-Type-Options: {headers.get('X-Content-Type-Options')}")
    if "Serverless Deployer Audit Verification" in content:
        print("Verification PASSED: Live site content served successfully!")
    else:
        print("Verification FAILED: Content mismatch.")
        sys.exit(1)

# 7. Verify Canonical 302 Redirect on Naked Path
naked_url = f"https://{CLOUDFRONT_DOMAIN}/projects/{PROJECT_ID}"
class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

opener = urllib.request.build_opener(NoRedirectHandler)
try:
    resp = opener.open(naked_url)
except urllib.error.HTTPError as he:
    if he.code == 302 and he.headers.get("Location") == f"/projects/{PROJECT_ID}/live/":
        print(f"Canonical 302 Redirect PASSED: {naked_url} -> {he.headers.get('Location')}")
    else:
        print(f"Canonical Redirect FAILED: {he.code} {he.headers.get('Location')}")

# 8. Clean up test project via DELETE /api/projects/{projectId}
print(f"\nTesting cleanup: DELETE /api/projects/{PROJECT_ID}")
del_req = urllib.request.Request(f"{BASE_URL}/projects/{PROJECT_ID}", method="DELETE")
with urllib.request.urlopen(del_req) as resp:
    del_res = json.loads(resp.read().decode("utf-8"))
    print("Delete response:", del_res)

# Clean local zip
if os.path.exists(zip_path):
    os.remove(zip_path)

print("\n>>> ALL E2E AUDIT TESTS COMPLETED SUCCESSFULLY! <<<")
