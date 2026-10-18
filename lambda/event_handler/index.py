import json
import logging
import os
from datetime import datetime, timezone
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource("dynamodb")
PROJECTS_TABLE = os.environ.get("PROJECTS_TABLE")
DEPLOYMENTS_TABLE = os.environ.get("DEPLOYMENTS_TABLE")

projects_table = dynamodb.Table(PROJECTS_TABLE)
deployments_table = dynamodb.Table(DEPLOYMENTS_TABLE)


def handler(event, context):
    logger.info("Received event: %s", json.dumps(event))

    detail = event.get("detail", {})
    build_status = detail.get("build-status")
    project_name = detail.get("project-name")
    raw_build_id = detail.get("build-id", "")

    # Extract custom environment variables
    env_vars = {}
    add_info = detail.get("additional-information", {})
    for item in add_info.get("environment", {}).get("environment-variables", []):
        env_vars[item.get("name")] = item.get("value")

    project_id = env_vars.get("PROJECT_ID")
    build_id = env_vars.get("BUILD_ID")

    if not project_id or not build_id:
        logger.warning(
            "Missing PROJECT_ID or BUILD_ID in environment variables. detail=%s", detail
        )
        return {"statusCode": 200, "body": "Skipped: Missing IDs"}

    # Extract log details
    logs_info = add_info.get("logs", {})
    log_group_name = logs_info.get("group-name", "")
    log_stream_name = logs_info.get("stream-name", "")

    now_iso = datetime.now(timezone.utc).isoformat()
    duration = detail.get("completed-phase-duration-in-seconds", 0)

    # 1. Update Deployment Record
    update_expr = (
        "SET #status = :status, "
        "updatedAt = :now, "
        "logGroupName = :lg, "
        "logStreamName = :ls"
    )
    expr_attr_names = {"#status": "status"}
    expr_attr_values = {
        ":status": build_status,
        ":now": now_iso,
        ":lg": log_group_name,
        ":ls": log_stream_name,
    }

    if build_status in ["SUCCEEDED", "FAILED", "STOPPED"]:
        update_expr += ", endTime = :now, #dur = :dur"
        expr_attr_names["#dur"] = "duration"
        expr_attr_values[":dur"] = duration

    if build_status in ["FAILED", "STOPPED"]:
        failed_phase = detail.get("current-phase", "UNKNOWN")
        update_expr += ", errorMessage = :err"
        expr_attr_values[":err"] = f"Build failed during phase: {failed_phase}"

    logger.info(
        "Updating deployment: projectId=%s, buildId=%s, status=%s",
        project_id,
        build_id,
        build_status,
    )
    deployments_table.update_item(
        Key={"projectId": project_id, "buildId": build_id},
        UpdateExpression=update_expr,
        ExpressionAttributeNames=expr_attr_names,
        ExpressionAttributeValues=expr_attr_values,
    )

    # 2. Update Project Record
    if build_status == "SUCCEEDED":
        logger.info("Promoting project %s to live build %s", project_id, build_id)
        projects_table.update_item(
            Key={"projectId": project_id},
            UpdateExpression=(
                "SET currentLiveBuildId = :bId, "
                "liveUrl = :url, "
                "lastDeployedAt = :now, "
                "latestBuildStatus = :status"
            ),
            ExpressionAttributeValues={
                ":bId": build_id,
                ":url": f"/projects/{project_id}/live/",
                ":now": now_iso,
                ":status": "SUCCEEDED",
            },
        )
    elif build_status in ["FAILED", "STOPPED"]:
        projects_table.update_item(
            Key={"projectId": project_id},
            UpdateExpression="SET latestBuildStatus = :status",
            ExpressionAttributeValues={":status": build_status},
        )
    elif build_status == "IN_PROGRESS":
        projects_table.update_item(
            Key={"projectId": project_id},
            UpdateExpression="SET latestBuildStatus = :status",
            ExpressionAttributeValues={":status": "IN_PROGRESS"},
        )

    return {"statusCode": 200, "body": json.dumps({"status": "SUCCESS"})}
