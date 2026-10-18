import json
import logging
import os
import time
import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
s3 = boto3.client("s3")
cloudfront = boto3.client("cloudfront")

PROJECTS_TABLE = os.environ.get("PROJECTS_TABLE")
DEPLOYMENTS_TABLE = os.environ.get("DEPLOYMENTS_TABLE")
BUCKET_NAME = os.environ.get("BUCKET_NAME")
CLOUDFRONT_DIST_ID = os.environ.get("CLOUDFRONT_DIST_ID")

projects_table = dynamodb.Table(PROJECTS_TABLE)
deployments_table = dynamodb.Table(DEPLOYMENTS_TABLE)


class DecimalEncoder(json.JSONEncoder):

    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET,DELETE",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
        },
        "body": json.dumps(body, cls=DecimalEncoder),
    }


def handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    http_method = event.get("requestContext", {}).get("http", {}).get("method", "")
    path_params = event.get("pathParameters") or {}
    project_id = path_params.get("projectId")

    if http_method == "OPTIONS":
        return response(200, {"message": "OK"})

    # DELETE /api/projects/{projectId} -> Delete project, deployments, S3 files, and invalidate cache
    if http_method == "DELETE" and project_id:
        try:
            proj_res = projects_table.get_item(Key={"projectId": project_id})
            project = proj_res.get("Item")
            if not project:
                return response(404, {"error": "Project not found"})

            # 1. Delete all deployment records
            dep_res = deployments_table.query(
                KeyConditionExpression=Key("projectId").eq(project_id)
            )
            items = dep_res.get("Items", [])
            with deployments_table.batch_writer() as batch:
                for item in items:
                    batch.delete_item(
                        Key={"projectId": project_id, "buildId": item["buildId"]}
                    )

            # 2. Delete project record
            projects_table.delete_item(Key={"projectId": project_id})

            # 3. Clean up S3 storage
            if BUCKET_NAME:
                paginator = s3.get_paginator("list_objects_v2")
                objects_to_del = []
                for prefix in [
                    f"hosted/{project_id}/",
                    f"artifacts/{project_id}/",
                    f"sources/{project_id}/",
                ]:
                    for page in paginator.paginate(
                        Bucket=BUCKET_NAME, Prefix=prefix
                    ):
                        for obj in page.get("Contents", []):
                            objects_to_del.append({"Key": obj["Key"]})
                            if len(objects_to_del) >= 1000:
                                s3.delete_objects(
                                    Bucket=BUCKET_NAME,
                                    Delete={
                                        "Objects": objects_to_del,
                                        "Quiet": True,
                                    },
                                )
                                objects_to_del = []

                if objects_to_del:
                    s3.delete_objects(
                        Bucket=BUCKET_NAME,
                        Delete={"Objects": objects_to_del, "Quiet": True},
                    )

            # 4. Invalidate CloudFront cache
            if CLOUDFRONT_DIST_ID:
                try:
                    cloudfront.create_invalidation(
                        DistributionId=CLOUDFRONT_DIST_ID,
                        InvalidationBatch={
                            "Paths": {
                                "Quantity": 1,
                                "Items": [f"/projects/{project_id}/*"],
                            },
                            "CallerReference": f"delete-{project_id}-{int(time.time())}",
                        },
                    )
                except Exception as cf_err:
                    logger.warning("CloudFront invalidation error: %s", str(cf_err))

            return response(
                200,
                {
                    "message": f"Project '{project_id}' and all associated deployments were permanently deleted.",
                    "projectId": project_id,
                },
            )
        except Exception as e:
            logger.exception("Error deleting project %s: %s", project_id, str(e))
            return response(500, {"error": str(e)})

    # GET /api/projects/{projectId} -> Single project with deployment history
    if project_id:
        try:
            proj_res = projects_table.get_item(Key={"projectId": project_id})
            project = proj_res.get("Item")
            if not project:
                return response(404, {"error": "Project not found"})

            # Query deployments for this project (sorted by buildId descending)
            dep_res = deployments_table.query(
                KeyConditionExpression=Key("projectId").eq(project_id),
                ScanIndexForward=False,  # latest first
                Limit=50,
            )
            deployments = dep_res.get("Items", [])

            return response(
                200, {"project": project, "deployments": deployments}
            )
        except Exception as e:
            logger.exception("Error getting project: %s", str(e))
            return response(500, {"error": str(e)})

    # GET /api/projects -> List all projects
    if http_method == "GET":
        try:
            res = projects_table.scan(Limit=100)
            items = res.get("Items", [])
            # Sort by updatedAt or createdAt descending
            items.sort(
                key=lambda x: x.get("updatedAt", x.get("createdAt", "")),
                reverse=True,
            )
            return response(200, {"projects": items})
        except Exception as e:
            logger.exception("Error listing projects: %s", str(e))
            return response(500, {"error": str(e)})

    return response(404, {"error": "Endpoint not found"})
