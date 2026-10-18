# Serverless Automated Build & Deployment Platform on AWS

A fully serverless, observable, and cost-effective continuous deployment platform for static websites and Single-Page Applications (SPAs). Built entirely with AWS managed serverless primitives, it provides a self-hosted alternative to Vercel and Netlify while revealing the internal mechanics of modern hosting pipelines.

---

## 🌟 Key Features

* **Zero-Server Ephemeral Builds**: Ephemeral builds powered by **AWS CodeBuild** (Amazon Linux 2023, Node.js 20). No dedicated runners or EC2 instances to manage or patch.
* **Single-Distribution Multi-Project Hosting**: All deployed projects are hosted under isolated subpaths (e.g. `/projects/{projectId}/live/`) on a **single Amazon CloudFront distribution** with **Origin Access Control (OAC)**.
* **Smart Base-Path Auto-Configuration**: Automated base path injection (`--base`, `PUBLIC_URL`, `<base href="...">`) ensures Vite, React, Vue, and static HTML bundles resolve assets correctly when hosted on subpaths.
* **Client-Side SPA Routing via Edge Functions**: A **CloudFront Function (Viewer Request)** transparently rewrites deep routes to `index.html` (HTTP 200 pass-through), eliminating S3 404 errors for React Router and Vue Router.
* **Immutable Versioning & Zero-Downtime Rollback**: Every build is snapshotted to `artifacts/{projectId}/{buildId}/`. Rolling back takes less than 3 seconds via an S3 server-side batch copy to `hosted/{projectId}/live/` and CloudFront cache invalidation.
* **Real-Time Observability & Log Streaming**: CloudWatch logs are streamed directly to the platform dashboard terminal via API Gateway without exposing AWS Console credentials.
* **Automated Failure Alerts**: EventBridge detects failed builds and dispatches alerts via **Amazon SNS**.
* **Zero Idle Costs & Spending Guardrails**: Only pay for compute when builds run. S3 lifecycle policies auto-expire raw ZIP files, and **AWS Budgets** alerts guard against unexpected spending.

---

## 🏗️ Architecture

```
                                    +-------------------------------------------------------------+
                                    |                      USER DASHBOARD                         |
                                    |   (React 18 + Vite + Tailwind hosted on CloudFront CDN)     |
                                    +--------------+------------------+---------------------------+
                                                   |                  |
                                    1. Request URL | 2. Upload ZIP    | 5. Stream Logs / Rollback
                                                   v                  v
+-------------------------------+        +---------+--------+       +-+------------------+
|          CLIENT / EDGE        |        |   API Gateway    |       |    API Gateway     |
|   Amazon CloudFront (CDN)     |        |    (HTTP API)    |       |     (HTTP API)     |
|              +                |        +---------+--------+       +---------+----------+
|  CloudFront Function (Rewrite)|                  |                          |
|              +                |                  v                          v
|  Origin Access Control (OAC)  |        +---------+--------+       +---------+----------+
+--------------+----------------+        |  Upload Lambda   |       |  Logs / Rollback   |
               |                         +---------+--------+       |      Lambdas       |
               |                                   |                +---------+----------+
               v                                   v                          |
+--------------+----------------+        +---------+--------+                 v
|       Amazon S3 Bucket        |        |   AWS CodeBuild  |       +---------+----------+
|  /dashboard/ (Admin App)      | <----+ | (Ephemeral Node) | ----> |   Amazon DynamoDB  |
|  /sources/   (Raw ZIPs)       |        +---------+--------+       |   (Projects &      |
|  /artifacts/ (Immutable Vers) |                  |                |    Deployments)    |
|  /hosted/    (Live Sites)     |                  v                +--------------------+
+-------------------------------+        +---------+--------+                 ^
                                         | CloudWatch Logs  |                 |
                                         +---------+--------+                 |
                                                   |                          |
                                                   v                          |
                                         +---------+--------+                 |
                                         | Amazon EventBridge| --------------+
                                         +---------+--------+   State Changes
                                                   |
                                                   v (On Failure)
                                         +---------+--------+
                                         |    Amazon SNS    | ===> Admin Email Alert
                                         +------------------+
```

---

## 📂 Project Structure

```
.
├── buildspec/
│   └── buildspec.yml                # Ephemeral build script with subpath base injection
├── cloudfront/
│   └── viewer_request.js            # CloudFront Function for SPA rewrites & subpath routing
├── lambda/
│   ├── event_handler/index.py       # EventBridge -> DynamoDB status synchronizer
│   ├── upload/index.py              # S3 Presigned URL generator & CodeBuild trigger
│   ├── projects/index.py            # Project listings and deployment histories
│   ├── logs/index.py                # CloudWatch live log streaming API
│   └── rollback/index.py            # Zero-downtime S3 copy & CloudFront cache invalidation
├── terraform/
│   ├── versions.tf                  # Terraform & AWS provider requirements
│   ├── variables.tf                 # Configurable variables (region, budget, email)
│   ├── s3.tf                        # S3 bucket, CORS, lifecycle policies & encryption
│   ├── dynamodb.tf                  # On-demand Projects and Deployments tables
│   ├── sns.tf                       # Failure notification topic & email subscription
│   ├── codebuild.tf                 # Ephemeral builder container project & IAM roles
│   ├── eventbridge.tf               # EventBridge state change rules & routing
│   ├── lambdas.tf                   # Lambda functions and archive zip definitions
│   ├── apigateway.tf                # HTTP API Gateway with CORS & routes
│   ├── cloudfront.tf                # Unified CloudFront CDN with OAC & rewrites
│   ├── budgets.tf                   # Monthly cost limit safeguard ($10 default)
│   ├── outputs.tf                   # URLs, bucket names, and resource identifiers
│   └── terraform.tfvars.example     # Sample configuration variables
├── dashboard/                       # React 18 + Vite + Tailwind CSS management UI
│   ├── src/
│   │   ├── api.js                   # API client with S3 direct upload progress
│   │   ├── components/              # Terminal, Modals, Project Cards, Navigation
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
├── samples/
│   ├── static-html/                 # Static HTML/CSS/JS test project
│   └── vite-react-spa/              # Vite React SPA with client routing test
├── scripts/
│   ├── package_samples.ps1          # Packages test projects into ready-to-deploy ZIPs
│   └── deploy_dashboard.ps1         # Builds & syncs dashboard to S3 & CloudFront
└── plan.md                          # Product requirements & architecture blueprint
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* **Terraform** >= 1.6 ([Install](https://developer.hashicorp.com/terraform/install))
* **AWS CLI** v2 ([Install](https://aws.amazon.com/cli/))
* **Node.js** >= 18 and **npm**
* Active AWS Account configured with credentials:
  ```bash
  aws configure
  ```

### 2. Deploy Infrastructure with Terraform
1. Navigate to the terraform directory:
   ```bash
   cd terraform
   ```
2. Copy and customize configuration variables:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```
   *(Set `aws_region`, `alert_email` for build failure emails, and `budget_limit_usd`)*.

3. Initialize and apply:
   ```bash
   terraform init
   terraform apply
   ```
4. Note the outputs:
   * `dashboard_url`: The CloudFront domain serving the platform.
   * `s3_platform_bucket`: The backend storage bucket.
   * `cloudfront_distribution_id`: The CDN distribution ID.

### 3. Build & Deploy the Platform Dashboard
Deploy the React dashboard to the CloudFront distribution:
```powershell
# From the project root (PowerShell):
.\scripts\deploy_dashboard.ps1
```
Or manually:
```bash
cd dashboard
npm install
npm run build
aws s3 sync dist/ s3://<s3_platform_bucket>/dashboard/ --delete
aws cloudfront create-invalidation --distribution-id <cloudfront_distribution_id> --paths "/dashboard/*" "/"
```

### 4. Open the Web Dashboard
Open `dashboard_url` in your browser:
```
https://<cloudfront-domain>/
```

---

## 🧪 Testing Deployments with Sample Projects

Pre-configured sample projects are included to verify functionality:

### 1. Package the Samples
Run the packaging script to generate `.zip` archives:
```powershell
.\scripts\package_samples.ps1
```
This generates:
* `samples/static-html.zip` — Plain static website.
* `samples/vite-react-spa.zip` — Modern Vite + React SPA.

### 2. Deploy via Web Dashboard
1. Open the dashboard in your browser.
2. Click **Deploy Project**.
3. Set Project Identifier (e.g. `react-demo`).
4. Select `samples/vite-react-spa.zip`.
5. Click **Start Build & Deploy**.
6. Watch the live CloudWatch terminal stream npm installation and Vite compilation.
7. Click **Visit Live Application** once completed to access:
   ```
   https://<cloudfront-domain>/projects/react-demo/live/
   ```

### 3. Test One-Click Rollback
1. Upload an updated version of your project or another sample under the same Project ID.
2. Click **History** on the project card.
3. Click **Rollback** on the earlier version.
4. The site is restored in < 3 seconds with CloudFront cache automatically purged.

---

## 💰 Cost & Resource Safeguards

| Resource | Free Tier / Pricing Policy | Safeguard Enforced |
| :--- | :--- | :--- |
| **AWS CodeBuild** | Free Tier includes 100 build min/month (`BUILD_GENERAL1_SMALL`). | Hard 5-minute timeout per build. |
| **Amazon S3** | Standard storage; first 5 GB free. | S3 Lifecycle rule purges `/sources/` ZIPs after 14 days. |
| **CloudFront** | 1 TB data transfer out free per month. | PriceClass_100 (lowest cost region tier). |
| **DynamoDB** | 25 GB storage free; On-Demand pricing. | Zero idle costs; pay only per write/read. |
| **AWS Budgets** | 2 free budgets per account. | Automated threshold alert at \$10 monthly limit. |

---

## 🧹 Teardown

To destroy all provisioned cloud infrastructure and avoid any recurring costs:
```bash
cd terraform
terraform destroy
```
