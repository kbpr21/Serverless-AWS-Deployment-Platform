import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
cloudfront = boto3.client("cloudfront")

PROJECTS_TABLE = os.environ.get("PROJECTS_TABLE")
DEPLOYMENTS_TABLE = os.environ.get("DEPLOYMENTS_TABLE")
BUCKET_NAME = os.environ.get("BUCKET_NAME")
CLOUDFRONT_DIST_ID = os.environ.get("CLOUDFRONT_DIST_ID")

projects_table = dynamodb.Table(PROJECTS_TABLE)
deployments_table = dynamodb.Table(DEPLOYMENTS_TABLE)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body),
    }


def handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS":
        return response(200, {"message": "OK"})

    path_params = event.get("pathParameters") or {}
    project_id = path_params.get("projectId")

    try:
        body = json.loads(event.get("body", "{}") or "{}")
    except Exception:
        return response(400, {"error": "Invalid JSON body"})

    target_build_id = body.get("targetBuildId")

    if not project_id or not target_build_id:
        return response(400, {"error": "projectId and targetBuildId are required"})

    artifact_prefix = f"artifacts/{project_id}/{target_build_id}/"
    live_prefix = f"hosted/{project_id}/live/"

    # 1. Verify target version exists in S3
    try:
        s3.head_object(
            Bucket=BUCKET_NAME, Key=f"{artifact_prefix}index.html"
        )
    except Exception as e:
        logger.error(
            "Version artifact %sindex.html not found: %s",
            artifact_prefix,
            str(e),
        )
        return response(
            404,
            {"error": f"Target version {target_build_id} not found in storage"},
        )

    # 2. Copy all artifact objects to live prefix
    try:
        paginator = s3.get_paginator("list_objects_v2")
        copied_keys = set()

        for page in paginator.paginate(
            Bucket=BUCKET_NAME, Prefix=artifact_prefix
        ):
            for obj in page.get("Contents", []):
                src_key = obj["Key"]
                rel_path = src_key[len(artifact_prefix) :]
                if not rel_path:
                    continue

                dest_key = f"{live_prefix}{rel_path}"
                copied_keys.add(dest_key)

                # Determine Content-Type or preserve from source
                s3.copy_object(
                    Bucket=BUCKET_NAME,
                    CopySource={"Bucket": BUCKET_NAME, "Key": src_key},
                    Key=dest_key,
                    MetadataDirective="COPY",
                    CacheControl="public, max-age=0, must-revalidate",
                )

        logger.info(
            "Copied %d objects from %s to %s",
            len(copied_keys),
            artifact_prefix,
            live_prefix,
        )

        # Remove any lingering files from previous deployments not present in rolled-back version
        objects_to_delete = []
        for page in paginator.paginate(Bucket=BUCKET_NAME, Prefix=live_prefix):
            for obj in page.get("Contents", []):
                if obj["Key"] not in copied_keys:
                    objects_to_delete.append({"Key": obj["Key"]})
                    if len(objects_to_delete) >= 1000:
                        s3.delete_objects(
                            Bucket=BUCKET_NAME,
                            Delete={"Objects": objects_to_delete, "Quiet": True},
                        )
                        objects_to_delete = []

        if objects_to_delete:
            s3.delete_objects(
                Bucket=BUCKET_NAME,
                Delete={"Objects": objects_to_delete, "Quiet": True},
            )

    except Exception as e:
        logger.exception("Failed during S3 copy: %s", str(e))
        return response(500, {"error": f"Failed during S3 copy: {str(e)}"})

    # 3. Invalidate CloudFront cache
    invalidation_id = None
    if CLOUDFRONT_DIST_ID:
        try:
            inv_res = cloudfront.create_invalidation(
                DistributionId=CLOUDFRONT_DIST_ID,
                InvalidationBatch={
                    "Paths": {
                        "Quantity": 1,
                        "Items": [f"/projects/{project_id}/*"],
                    },
                    "CallerReference": f"rollback-{project_id}-{int(time.time())}",
                },
            )
            invalidation_id = inv_res.get("Invalidation", {}).get("Id")
            logger.info("CloudFront invalidation created: %s", invalidation_id)
        except Exception as e:
            logger.warning(
                "Could not create CloudFront invalidation: %s", str(e)
            )

    # 4. Update DynamoDB records
    now_iso = datetime.now(timezone.utc).isoformat()
    rollback_event_id = (
        f"rollback-{int(time.time())}-{uuid.uuid4().hex[:4]}"
    )

    projects_table.update_item(
        Key={"projectId": project_id},
        UpdateExpression="SET currentLiveBuildId = :bId, lastDeployedAt = :now, latestBuildStatus = :s",
        ExpressionAttributeValues={
            ":bId": target_build_id,
            ":now": now_iso,
            ":s": "SUCCEEDED",
        },
    )

    deployments_table.put_item(
        Item={
            "projectId": project_id,
            "buildId": rollback_event_id,
            "status": "SUCCEEDED",
            "type": "ROLLBACK",
            "rolledBackToBuildId": target_build_id,
            "startTime": now_iso,
            "endTime": now_iso,
            "duration": 1,
            "createdAt": now_iso,
        }
    )

    return response(
        200,
        {
            "success": True,
            "projectId": project_id,
            "currentLiveBuildId": target_build_id,
            "invalidationId": invalidation_id,
            "message": f"Successfully rolled back to version {target_build_id}",
        },
    )
