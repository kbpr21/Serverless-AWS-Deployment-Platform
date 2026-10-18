import json
import logging
import os
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

logs_client = boto3.client("logs")
dynamodb = boto3.resource("dynamodb")

DEPLOYMENTS_TABLE = os.environ.get("DEPLOYMENTS_TABLE")
DEFAULT_LOG_GROUP = os.environ.get("DEFAULT_LOG_GROUP")

deployments_table = dynamodb.Table(DEPLOYMENTS_TABLE)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "OPTIONS,GET",
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
    query_params = event.get("queryStringParameters") or {}

    project_id = path_params.get("projectId")
    build_id = path_params.get("buildId")
    next_token = query_params.get("nextToken")

    if not project_id or not build_id:
        return response(400, {"error": "projectId and buildId are required"})

    deployment = {}
    try:
        # Retrieve deployment metadata
        dep_res = deployments_table.get_item(
            Key={"projectId": project_id, "buildId": build_id}
        )
        deployment = dep_res.get("Item")
        if not deployment:
            return response(404, {"error": "Deployment not found"})

        log_group = deployment.get("logGroupName") or DEFAULT_LOG_GROUP
        log_stream = deployment.get("logStreamName")
        codebuild_id = deployment.get("codeBuildId")
        build_status = deployment.get("status", "UNKNOWN")

        # If log stream isn't in DynamoDB yet, attempt to infer from codeBuildId
        if not log_stream and codebuild_id and ":" in codebuild_id:
            log_stream = codebuild_id.split(":")[-1]

        # If still no log stream, check recent streams in log group
        if not log_stream:
            try:
                streams_res = logs_client.describe_log_streams(
                    logGroupName=log_group,
                    orderBy="LastEventTime",
                    descending=True,
                    limit=5,
                )
                streams = streams_res.get("logStreams", [])
                if streams:
                    log_stream = streams[0]["logStreamName"]
            except Exception as e:
                logger.warning("Could not describe log streams: %s", str(e))

        if not log_stream:
            return response(
                200,
                {
                    "status": build_status,
                    "events": [
                        {
                            "timestamp": 0,
                            "message": "[Waiting for CodeBuild container to start and initialize CloudWatch logs...]",
                        }
                    ],
                    "nextForwardToken": None,
                },
            )

        # Fetch log events
        params = {
            "logGroupName": log_group,
            "logStreamName": log_stream,
            "startFromHead": True,
            "limit": 100,
        }
        if next_token:
            params["nextToken"] = next_token

        events_res = logs_client.get_log_events(**params)
        events = [
            {"timestamp": ev["timestamp"], "message": ev["message"]}
            for ev in events_res.get("events", [])
        ]

        next_forward_token = events_res.get("nextForwardToken")
        # CloudWatch returns identical token if at end of stream
        if next_forward_token == next_token:
            next_forward_token = None

        return response(
            200,
            {
                "status": build_status,
                "logGroup": log_group,
                "logStream": log_stream,
                "events": events,
                "nextForwardToken": next_forward_token,
            },
        )

    except ClientError as ce:
        err_code = ce.response.get("Error", {}).get("Code")
        if err_code in ["ResourceNotFoundException"]:
            return response(
                200,
                {
                    "status": deployment.get("status", "QUEUED"),
                    "events": [
                        {
                            "timestamp": 0,
                            "message": "[Log stream provisioning in progress...]",
                        }
                    ],
                    "nextForwardToken": None,
                },
            )
        logger.exception("CloudWatch ClientError: %s", str(ce))
        return response(500, {"error": str(ce)})
    except Exception as e:
        logger.exception("Unexpected error fetching logs: %s", str(e))
        return response(500, {"error": str(e)})
