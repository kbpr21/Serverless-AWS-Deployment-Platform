# Project Plan: Serverless Automated Build and Deployment Platform on AWS

## 1. Product Requirements Document (PRD)

### 1.1 Executive Summary
The Serverless Automated Build and Deployment Platform is an open, observable, cost-effective AWS-native alternative to proprietary platforms like Vercel and Netlify. It targets students, indie developers, and small engineering teams who need zero-configuration continuous deployments for static sites and Single-Page Applications (SPAs) without managing dedicated CI/CD servers.

The platform provides a unified web dashboard hosted on Amazon CloudFront where users upload project ZIP archives, monitor build progress with real-time log streaming, access immutable version histories, and perform zero-downtime, instantaneous rollbacks.

---

### 1.2 Target Personas & Use Cases
* **Student / Learner**: Wants to showcase projects without paying $20/month for team tiers or deciphering complex Jenkins/GitHub Actions runners.
* **Solo Developer / Prototyper**: Needs rapid deployment of Vite, React, Vue, or static HTML sites with shareable, persistent URLs and build history.
* **AWS Cloud Enthusiast**: Wants full visibility into serverless cloud architectures (EventBridge, CodeBuild, CloudFront Functions, S3 OAC, and DynamoDB).

---

### 1.3 Scope Boundary

#### In-Scope
* **Project Formats**: Plain HTML/CSS/JS, Vite (React/Vue/Svelte/Vanilla), Create React App, static exports.
* **Upload Mechanism**: Web dashboard direct-to-S3 upload using S3 Presigned URLs.
* **Automated Ephemeral Builds**: AWS CodeBuild with automatic framework detection, dependency installation (`npm install`), and build script execution (`npm run build`).
* **Subpath Base Injection**: Automatic base-path configuration (`--base` / `PUBLIC_URL` / `<base href="...">`) so SPAs work seamlessly under project-specific URL subpaths.
* **Hosting & Routing**: Single Amazon CloudFront distribution fronting an Amazon S3 bucket with Origin Access Control (OAC). CloudFront Functions for SPA client-side routing rewrites.
* **Platform Dashboard**: Hosted on the same CloudFront distribution at `/` and `/dashboard/*`.
* **State & Versioning Tracking**: Amazon DynamoDB storing project metadata, build logs location, and immutable deployment records.
* **Rollbacks**: Instant rollback via S3 server-side batch copy from versioned artifact storage to live folder, followed by CloudFront cache invalidation.
* **Observability & Alerts**: CloudWatch Logs inspection from dashboard, EventBridge state transitions, and Amazon SNS email alerts on build failures.
* **Safety & Cost Safeguards**: Hard build timeouts (5 minutes), small compute tier (`BUILD_GENERAL1_SMALL`), and AWS Budgets alarm.

#### Out-of-Scope
* Server-Side Rendering (SSR) / Next.js Node server runtimes.
* Custom user domains (CNAME / ACM per project).
* User authentication and multi-tenancy RBAC (single-tenant / team-admin scope).
* Git provider webhooks (GitHub/GitLab integrations - uploads are ZIP-based).
* Application databases for hosted projects.

---

### 1.4 Functional Requirements (FR)

* **FR-1: Presigned Project Ingestion**: Given a project ZIP file, the API must generate an S3 presigned URL to allow direct browser-to-S3 upload without hitting API Gateway payload limits.
* **FR-2: Automated Build Triggering**: Upload completion triggers an AWS CodeBuild job with custom environment variables (`PROJECT_ID`, `BUILD_ID`, `SUBPATH_BASE`).
* **FR-3: Multi-Framework Compilation**: The build container automatically detects package managers and frameworks, injects the subpath base configuration, builds the static bundle, and uploads artifacts to S3.
* **FR-4: Live Site Provisioning**: Succeeded builds automatically promote output artifacts to the live hosting path `hosted/{projectId}/live/`.
* **FR-5: Event-Driven Lifecycle Recording**: CodeBuild status transitions (`SUBMITTED`, `IN_PROGRESS`, `SUCCEEDED`, `FAILED`, `STOPPED`) must be captured via Amazon EventBridge and written to DynamoDB within seconds.
* **FR-6: Near Real-Time Log Viewing**: The dashboard must provide build log streaming by querying CloudWatch Logs via backend API without requiring AWS Console access.
* **FR-7: Immutable Version Registry**: Every build creates an immutable snapshot at `artifacts/{projectId}/v{buildId}/`.
* **FR-8: One-Click Rollback**: Selecting a prior version initiates a server-side S3 copy to `hosted/{projectId}/live/` and creates a CloudFront invalidation for `/projects/{projectId}/*`.
* **FR-9: Failure Notifications**: When a build fails, an SNS notification is dispatched to subscribed administrators containing failure details and log links.
* **FR-10: Unified CloudFront Routing**: A single CloudFront distribution routes `/` to dashboard assets, `/api/*` to API Gateway, and `/projects/{projectId}/*` to user projects, handling SPA route fallback via CloudFront Functions.

---

### 1.5 Non-Functional Requirements (NFR)

* **NFR-1: Cost Efficiency**: Zero baseline compute costs when idle. All services must utilize serverless pay-per-request pricing (S3, CloudFront, Lambda, DynamoDB On-Demand, CodeBuild per-minute).
* **NFR-2: Performance**: Rollback operation completion time under 3 seconds (metadata update + S3 copy + CloudFront invalidation request).
* **NFR-3: Security**:
  * S3 bucket completely private with public access blocked; accessed only via CloudFront Origin Access Control (OAC) and least-privilege IAM roles.
  * API Gateway routes secured with CORS restrictions.
* **NFR-4: Reliability & Isolation**: Failed builds must not corrupt the currently active live version. Build errors terminate cleanly with non-zero exit codes captured in DynamoDB.
* **NFR-5: Infrastructure as Code (IaC)**: 100% reproducible via Terraform with clean separation of variables and modular components.

---

## 2. System Architecture & Design

### 2.1 High-Level Architecture Diagram

```mermaid
flowchart TD
    subgraph Client ["Client Browser"]
        UI["Web Dashboard (React + Tailwind)"]
        SiteVisitor["Site Visitor / Public User"]
    end

    subgraph CDN ["Edge Layer (Amazon CloudFront)"]
        CF["CloudFront Distribution"]
        CFF["CloudFront Function (Viewer Request SPA Rewrite)"]
        OAC["Origin Access Control (OAC)"]
    end

    subgraph API ["Ingestion & Control Plane"]
        APIGW["API Gateway (HTTP API)"]
        L_Upload["Lambda: CreatePresignedUpload"]
        L_Status["Lambda: GetDeploymentStatus & Logs"]
        L_Rollback["Lambda: TriggerRollback"]
        L_Projects["Lambda: ListProjects & Versions"]
    end

    subgraph Storage ["Storage Layer (Amazon S3)"]
        S3Bucket[("Platform S3 Bucket")]
        subgraph S3_Prefixes ["Bucket Partitions"]
            S3_Dash["/dashboard (Admin UI)"]
            S3_Src["/sources/{projectId}/{buildId}.zip"]
            S3_Art["/artifacts/{projectId}/{buildId}/"]
            S3_Live["/hosted/{projectId}/live/"]
        end
    end

    subgraph BuildSystem ["Compute & Pipeline"]
        CodeBuild["AWS CodeBuild (Standard 7.0 Container)"]
        CWLogs["Amazon CloudWatch Logs"]
    end

    subgraph EventAndState ["Eventing & State Management"]
        EB["Amazon EventBridge (Default Bus)"]
        L_EventHandler["Lambda: BuildStatusEventHandler"]
        DDB[("Amazon DynamoDB: Projects & Deployments")]
        SNS["Amazon SNS: BuildFailureTopic"]
        AdminEmail["Admin Email Notifications"]
    end

    %% Client Interactions
    UI -->|1. Request Upload URL| APIGW
    APIGW --> L_Upload
    L_Upload -->|Return Presigned URL| UI
    UI -->|2. Upload ZIP directly| S3_Src
    UI -->|3. Start Build Trigger| APIGW
    APIGW --> L_Upload
    L_Upload -->|StartBuild| CodeBuild

    %% Build Pipeline
    S3_Src -->|Pull Source ZIP| CodeBuild
    CodeBuild -->|Push Logs| CWLogs
    CodeBuild -->|Save Immutable Artifacts| S3_Art
    CodeBuild -->|Promote to Live on Success| S3_Live
    CodeBuild -->|State Changes| EB

    %% Event Handling
    EB -->|CodeBuild State Change| L_EventHandler
    L_EventHandler -->|Update Status & Metadata| DDB
    EB -->|Filter: FAILED| SNS
    SNS --> AdminEmail

    %% Client Queries & Rollback
    UI -->|Poll Status & Fetch Logs| APIGW
    APIGW --> L_Status
    L_Status --> DDB
    L_Status --> CWLogs
    UI -->|Request Rollback| APIGW
    APIGW --> L_Rollback
    L_Rollback -->|Copy S3_Art to S3_Live| S3Bucket
    L_Rollback -->|Invalidate Cache| CF
    L_Rollback -->|Update Live Version| DDB

    %% Public Traffic & Hosting
    SiteVisitor -->|View /projects/{id}/*| CF
    UI -->|Fetch Dashboard /| CF
    CF --> CFF
    CFF --> OAC
    OAC --> S3Bucket
```

---

### 2.2 S3 Storage Partitioning Model

A single S3 bucket (`<app-name>-platform-<account-id>`) is partitioned into isolated functional zones:

| S3 Key Prefix | Purpose | Immutability / Retention | Access Control |
| :--- | :--- | :--- | :--- |
| `dashboard/*` | Static assets of the platform dashboard itself | Overwritten on dashboard CI deployment | CloudFront OAC Read |
| `sources/{projectId}/{buildId}.zip` | Raw source archives uploaded by users | Immutable; 14-day S3 Lifecycle expiration | Lambda Write / CodeBuild Read |
| `artifacts/{projectId}/{buildId}/*` | Compiled build output directory per build | **Strictly Immutable** (archive copy) | CodeBuild Write / Lambda Copy |
| `hosted/{projectId}/live/*` | Currently active deployment served to visitors | Mutable (updated by CodeBuild or Rollback) | CloudFront OAC Read / CodeBuild Write / Lambda Write |

---

### 2.3 CloudFront Routing & CloudFront Function Architecture

A single CloudFront distribution routes all traffic via cache behaviors and an edge CloudFront Function (Viewer Request):

#### Cache Behaviors
1. **Behavior `/api/*`**:
   - Origin: API Gateway HTTP API.
   - Cache Policy: `CachingDisabled`.
   - Origin Request Policy: `AllViewerExceptHostHeader`.
2. **Behavior `/dashboard/*` & `/`**:
   - Origin: S3 Platform Bucket (`dashboard/` prefix).
   - Viewer Protocol: Redirect HTTP to HTTPS.
3. **Default Behavior `*` (or `/projects/*`)**:
   - Origin: S3 Platform Bucket with OAC.
   - CloudFront Function associated with **Viewer Request**.

#### CloudFront Function: Subpath & SPA Rewriting Logic
When a request comes in for `/projects/{projectId}/...`:
1. **Standard Asset**: e.g., `/projects/app-1/live/assets/main.css` $\rightarrow$ Rewritten to `/hosted/app-1/live/assets/main.css`.
2. **Root / Directory**: e.g., `/projects/app-1/` or `/projects/app-1/live/` $\rightarrow$ Rewritten to `/hosted/app-1/live/index.html`.
3. **Client-Side SPA Route**: e.g., `/projects/app-1/live/settings/profile` (no extension in URI) $\rightarrow$ Rewritten to `/hosted/app-1/live/index.html` (HTTP 200 pass-through, preserving the browser URL for React Router / Vue Router).
4. **Dashboard Fallback**: Requests to `/dashboard` or root `/` map to `/dashboard/index.html`.

---

### 2.4 CodeBuild Build Specification & The "Subpath Base" Solution

#### The Challenge
Modern bundlers (Vite, Webpack, Rollup) default to absolute asset paths (`/assets/index.js`), which causes 404 errors when an application is hosted under `/projects/{projectId}/live/`.

#### The Solution: Autonomous Build Script (`buildspec.yml` & runtime wrapper)
CodeBuild executes a build container (`aws/codebuild/amazon-linux-2023-x86_64-standard:7.0`) with Node.js 20 pre-installed:
1. **Unzip & Inspect**: Extracts `sources/{projectId}/{buildId}.zip`.
2. **Framework Detection & Base Configuration**:
   - **Vite**: CodeBuild appends or runs `npx vite build --base=/projects/${PROJECT_ID}/live/`.
   - **Create React App / Webpack**: Sets environment variable `PUBLIC_URL=/projects/${PROJECT_ID}/live/`.
   - **Static HTML/CSS**: Injects `<base href="/projects/${PROJECT_ID}/live/">` directly into `<head>` if not already present.
3. **Execution**:
   ```bash
   npm ci || npm install
   npm run build || npx vite build || npx parcel build || true
   ```
4. **Output Directory Auto-Discovery**: Checks `dist`, `build`, `out`, `public`, or current directory for `index.html`.
5. **Artifact Promotion**:
   - Uploads dist to `s3://${BUCKET}/artifacts/${PROJECT_ID}/${BUILD_ID}/`.
   - Copies dist to `s3://${BUCKET}/hosted/${PROJECT_ID}/live/`.
   - Triggers CloudFront cache invalidation for `/projects/${PROJECT_ID}/*`.

---

### 2.5 DynamoDB Schema Design

A single-table or dual-table design using On-Demand capacity:

#### Table 1: `Projects`
* **Partition Key (`PK`)**: `projectId` (String)
* **Attributes**:
  * `projectName`: String
  * `createdAt`: String (ISO 8601)
  * `currentLiveBuildId`: String
  * `liveUrl`: String
  * `totalDeployments`: Number

#### Table 2: `Deployments`
* **Partition Key (`PK`)**: `projectId` (String)
* **Sort Key (`SK`)**: `buildId` (String) - e.g., `build-1729000000-abcd`
* **Attributes**:
  * `status`: String (`QUEUED` | `IN_PROGRESS` | `SUCCEEDED` | `FAILED`)
  * `startTime`: String
  * `endTime`: String
  * `duration`: Number
  * `sourceZipKey`: String
  * `logGroupName`: String
  * `logStreamName`: String
  * `errorMessage`: String
  * `deployedBy`: String

---

### 2.6 Instant Rollback Mechanism

When the user selects **Rollback to Version X** in the dashboard:
1. Dashboard sends `POST /api/projects/{projectId}/rollback` with `{ "targetBuildId": "build-xxx" }`.
2. **Rollback Lambda**:
   * Validates that `s3://bucket/artifacts/{projectId}/{targetBuildId}/index.html` exists.
   * Executes S3 batch `CopyObject` operations:
     `artifacts/{projectId}/{targetBuildId}/*` $\rightarrow$ `hosted/{projectId}/live/*`.
   * Creates a CloudFront Invalidation for `/projects/{projectId}/*` (completes within 1–5 seconds).
   * Updates `currentLiveBuildId` in DynamoDB `Projects` table.
   * Writes a new deployment record marking the rollback event.
3. User experiences zero downtime and instant reversion.

---

### 2.7 Observability, Logs & Failure Alerts

1. **Log Streaming**:
   - CodeBuild writes stdout/stderr to CloudWatch Logs: `/aws/codebuild/<app>-builder`.
   - The API provides `GET /api/projects/{projectId}/builds/{buildId}/logs?nextToken=...`.
   - Lambda calls CloudWatch `GetLogEvents` and returns lines with pagination tokens, rendered in a streaming console component in the dashboard.
2. **Alerting Pipeline**:
   - EventBridge Rule:
     ```json
     {
       "source": ["aws.codebuild"],
       "detail-type": ["CodeBuild Build State Change"],
       "detail": {
         "build-status": ["FAILED", "STOPPED"]
       }
     }
     ```
   - Target 1: Lambda updates DynamoDB status to `FAILED` with `errorMessage`.
   - Target 2: Amazon SNS Topic (`<app>-build-failures`) sends email notifications to the admin.

---

## 3. Technology Stack Recommendation

| Layer | Selected Technology | Rationale |
| :--- | :--- | :--- |
| **IaC** | **Terraform** (v1.6+) | Explicitly requested. Declarative, cross-platform, industry standard with AWS Provider v5.x. |
| **Backend Lambdas** | **Python 3.12 (boto3)** | Built-in AWS SDK (`boto3`) requires zero `npm install` or bundlers, allowing clean, turnkey packaging via Terraform `archive_file`. Fast cold starts (< 120ms). |
| **Build Engine** | **AWS CodeBuild** | Fully managed containerized build runner; charges strictly per compute minute ($0.005/min), no server patching. |
| **Edge & CDN** | **Amazon CloudFront + CloudFront Functions** | Sub-millisecond URL rewrites at edge; unified domain for both API, Dashboard, and Hosted Apps. |
| **Storage** | **Amazon S3** + OAC | 99.999999999% durability, native presigned URLs, S3-to-S3 fast copy for rollbacks. |
| **Database** | **Amazon DynamoDB** | Zero idle costs (Pay-Per-Request / On-Demand), sub-10ms response times for project and status queries. |
| **Event Routing** | **Amazon EventBridge** | Native integration with CodeBuild status updates, serverless decoupled event dispatch. |
| **Dashboard UI** | **React 18 + Vite + Tailwind CSS + Lucide** | Fast, responsive, modern single-page dashboard with build terminal UI, deployed to CloudFront `/dashboard/`. |

---

## 4. Phase-Wise Implementation Plan

```
Phase 1: Foundation & Core Storage (Terraform)
Phase 2: Build Engine & Event-Driven Pipeline (CodeBuild + EventBridge + DynamoDB + SNS)
Phase 3: Backend Control Plane API (Lambdas + API Gateway)
Phase 4: CloudFront Edge Routing & Hosting Engine (OAC + CloudFront Function)
Phase 5: Platform Dashboard UI (React + Vite + Tailwind)
Phase 6: End-to-End Verification, Sample Projects & Cost Safeguards
```

### Phase 1: Foundation & Core Storage (Terraform)
* **Goal**: Establish AWS provider configuration, S3 platform storage bucket, and base DynamoDB tables.
* **Deliverables**:
  - `terraform/versions.tf` & `terraform/variables.tf`.
  - `terraform/s3.tf`: Platform S3 bucket with versioning, lifecycle policy (14 days on `/sources`), and private bucket policies.
  - `terraform/dynamodb.tf`: `Projects` and `Deployments` tables with On-Demand billing.
  - `terraform/sns.tf`: Build failure SNS topic and email subscription variable.
* **Verification Gate**:
  - `terraform validate` and `terraform plan` succeed.
  - Tables and S3 bucket provisioned cleanly.

### Phase 2: Build Engine & Event Pipeline
* **Goal**: Create the ephemeral AWS CodeBuild project, IAM service roles, EventBridge rules, and status handler.
* **Deliverables**:
  - `terraform/codebuild.tf`: CodeBuild project configured with `BUILD_GENERAL1_SMALL`, timeout of 5 minutes, CloudWatch logging enabled.
  - `buildspec/buildspec.yml`: Build script with automatic base path injection (`--base`, `PUBLIC_URL`, `<base href>`), framework build commands, and S3 artifact sync.
  - `lambda/event_handler/index.py`: Parses CodeBuild state transitions, extracts logs pointer, and writes status to DynamoDB.
  - `terraform/eventbridge.tf`: EventBridge rule routing CodeBuild state changes to Lambda and SNS.
* **Verification Gate**:
  - Trigger manual test build in CodeBuild; verify state transition writes into DynamoDB and logs populate in CloudWatch.

### Phase 3: Backend Control Plane API (Lambdas + API Gateway)
* **Goal**: Expose RESTful endpoints for dashboard interactions.
* **Deliverables**:
  - `lambda/upload/index.py`: Generates S3 presigned PUT URL and triggers CodeBuild `StartBuild`.
  - `lambda/projects/index.py`: Lists projects, project deployment histories, and live version tags.
  - `lambda/logs/index.py`: Queries CloudWatch Logs `GetLogEvents` for active or past builds.
  - `lambda/rollback/index.py`: Performs S3 batch copy from `artifacts/...` to `hosted/...` and triggers CloudFront cache invalidation.
  - `terraform/apigateway.tf`: HTTP API Gateway with CORS, route integrations, and IAM invocation policies.
* **Verification Gate**:
  - Curl/Postman test: request presigned upload URL $\rightarrow$ upload test ZIP $\rightarrow$ verify CodeBuild starts $\rightarrow$ query status endpoint.

### Phase 4: CloudFront Edge Routing & Hosting Engine
* **Goal**: Unify dashboard, APIs, and hosted project sites under a single CloudFront distribution.
* **Deliverables**:
  - `cloudfront/viewer_request.js`: CloudFront Function handling subpath rewrites (`/projects/{id}/live/...`), directory indexing, and SPA 404 fallbacks.
  - `terraform/cloudfront.tf`:
    - CloudFront distribution with Origin Access Control (OAC).
    - Origins: S3 Bucket (Root/Dashboard & Projects) + API Gateway (`/api/*`).
    - Cache behaviors configured with Viewer Request CloudFront Function.
* **Verification Gate**:
  - Manual files placed in S3 `hosted/test-app/live/index.html` are accessible at `https://<cf-domain>/projects/test-app/live/`.
  - Deep routes (e.g., `/projects/test-app/live/subpage`) successfully rewrite to `index.html`.

### Phase 5: Platform Dashboard UI
* **Goal**: Build a clean, responsive developer dashboard for uploading and managing projects.
* **Deliverables**:
  - `dashboard/`: Vite + React + Tailwind CSS single-page app:
    - **Project List View**: Active projects, live URLs, current version tags, status indicators.
    - **Upload Modal**: Drag-and-drop ZIP upload with project name specification and direct S3 presigned upload progress bar.
    - **Build Details & Terminal**: Real-time polling of build status and live-scrolling CloudWatch terminal log viewer.
    - **Version History & Rollback Modal**: Timeline of past builds with one-click **"Rollback to this version"** button.
  - Script / Terraform integration to build dashboard and sync to `s3://${BUCKET}/dashboard/`.
* **Verification Gate**:
  - Access `https://<cf-domain>/` and interact with the UI to create a project, monitor the build in the terminal, and view the live link.

### Phase 6: End-to-End Verification, Sample Projects & Cost Safeguards
* **Goal**: Verify with real-world applications and enforce safety guardrails.
* **Deliverables**:
  - `samples/static-html/`: Simple HTML5 + CSS3 + JS test fixture.
  - `samples/vite-react-spa/`: Full React SPA with client-side React Router navigation (verifying base path and SPA rewrite).
  - `terraform/budgets.tf`: AWS Budgets notification for $10 monthly threshold.
  - `README.md`: Architecture guide, deployment manual, and testing walkthrough.
* **Verification Gate**:
  - Deploy `vite-react-spa`, navigate routes, trigger a new update, verify version history, perform rollback, and confirm SNS email received on intentional build failure.

---

## 5. Review & Approval Gate
This plan provides the complete blueprint without having generated any application or infrastructure code. 

**Next Steps**: Upon your review and approval of `plan.md`, we will proceed with **Phase 1 (Terraform Foundation & Storage)**.
