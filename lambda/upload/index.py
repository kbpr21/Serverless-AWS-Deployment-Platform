import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
import boto3
from botocore.config import Config

import re

PROJECT_ID_REGEX = re.compile(r"^[a-z0-9][a-z0-9-_]{1,63}$")

logger = logging.getLogger()
logger.setLevel(logging.INFO)

REGION = os.environ.get("AWS_REGION", "ap-south-1")
s3_client = boto3.client(
    "s3",
    region_name=REGION,
    endpoint_url=f"https://s3.{REGION}.amazonaws.com",
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)
dynamodb = boto3.resource("dynamodb")
codebuild_client = boto3.client("codebuild")

PROJECTS_TABLE = os.environ.get("PROJECTS_TABLE")
DEPLOYMENTS_TABLE = os.environ.get("DEPLOYMENTS_TABLE")
BUCKET_NAME = os.environ.get("BUCKET_NAME")
CODEBUILD_PROJECT_NAME = os.environ.get("CODEBUILD_PROJECT_NAME")

projects_table = dynamodb.Table(PROJECTS_TABLE)
deployments_table = dynamodb.Table(DEPLOYMENTS_TABLE)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body),
    }


def handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    route_key = event.get("routeKey", "")
    raw_path = event.get("rawPath", "")

    if http_method == "OPTIONS":
        return response(200, {"message": "OK"})

    try:
        body = json.loads(event.get("body", "{}") or "{}")
    except Exception:
        return response(400, {"error": "Invalid JSON body"})

    # Route: POST /api/upload (Generate Presigned URL)
    if "upload" in raw_path or "upload" in route_key:
        project_id = body.get("projectId", "").strip().lower()
        project_name = body.get("projectName", "").strip() or project_id

        if not project_id:
            return response(400, {"error": "projectId is required"})

        if not PROJECT_ID_REGEX.match(project_id):
            return response(
                400,
                {
                    "error": (
                        "Invalid projectId format. Must be 2-64 characters, start with an "
                        "alphanumeric character, and contain only lowercase letters, numbers, hyphens, and underscores."
                    )
                },
            )

        build_id = f"build-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        s3_key = f"sources/{project_id}/{build_id}.zip"
        now_iso = datetime.now(timezone.utc).isoformat()

        # Generate presigned PUT URL (valid for 15 minutes, universal binary/zip upload)
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": s3_key,
            },
            ExpiresIn=900,
        )

        # Upsert Project record
        projects_table.update_item(
            Key={"projectId": project_id},
            UpdateExpression=(
                "SET projectName = if_not_exists(projectName, :name), "
                "createdAt = if_not_exists(createdAt, :now), "
                "updatedAt = :now, "
                "latestBuildId = :bId, "
                "latestBuildStatus = :status"
            ),
            ExpressionAttributeValues={
                ":name": project_name,
                ":now": now_iso,
                ":bId": build_id,
                ":status": "PENDING_UPLOAD",
            },
        )

        # Create Deployment record
        deployments_table.put_item(
            Item={
                "projectId": project_id,
                "buildId": build_id,
                "status": "PENDING_UPLOAD",
                "sourceZipKey": s3_key,
                "startTime": now_iso,
                "createdAt": now_iso,
            }
        )

        return response(
            200,
            {
                "projectId": project_id,
                "buildId": build_id,
                "uploadUrl": presigned_url,
                "s3Key": s3_key,
            },
        )

    # Route: POST /api/builds/start (Trigger CodeBuild once S3 upload completes)
    if "start" in raw_path or "start" in route_key:
        project_id = body.get("projectId")
        build_id = body.get("buildId")

        if not project_id or not build_id:
            return response(400, {"error": "projectId and buildId are required"})

        s3_key = f"sources/{project_id}/{build_id}.zip"

        # Verify object exists in S3
        try:
            s3_client.head_object(Bucket=BUCKET_NAME, Key=s3_key)
        except Exception as e:
            logger.error("Source zip not found in S3: %s", str(e))
            return response(
                404, {"error": "Source archive not found. Did upload complete?"}
            )

        # Trigger CodeBuild
        try:
            build_res = codebuild_client.start_build(
                projectName=CODEBUILD_PROJECT_NAME,
                environmentVariablesOverride=[
                    {
                        "name": "PROJECT_ID",
                        "value": project_id,
                        "type": "PLAINTEXT",
                    },
                    {"name": "BUILD_ID", "value": build_id, "type": "PLAINTEXT"},
                    {
                        "name": "BUCKET_NAME",
                        "value": BUCKET_NAME,
                        "type": "PLAINTEXT",
                    },
                ],
            )
            cb_build = build_res.get("build", {})
            cb_id = cb_build.get("id")

            # Update Deployment to QUEUED
            deployments_table.update_item(
                Key={"projectId": project_id, "buildId": build_id},
                UpdateExpression="SET #s = :s, codeBuildId = :cbId",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":s": "QUEUED", ":cbId": cb_id},
            )

            # Update Project to QUEUED
            projects_table.update_item(
                Key={"projectId": project_id},
                UpdateExpression="SET latestBuildStatus = :s",
                ExpressionAttributeValues={":s": "QUEUED"},
            )

            return response(
                200,
                {
                    "message": "Build started successfully",
                    "projectId": project_id,
                    "buildId": build_id,
                    "codeBuildId": cb_id,
                    "status": "QUEUED",
                },
            )
        except Exception as e:
            logger.exception("Failed to start CodeBuild: %s", str(e))
            return response(500, {"error": f"Failed to start build: {str(e)}"})

    return response(404, {"error": "Endpoint not found"})
