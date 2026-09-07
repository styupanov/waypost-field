"""Secrets Manager RDS configuration; no credential files, logging or URL interpolation."""

import json
import os
import re
import ssl
from contextlib import closing

import boto3
from botocore.config import Config
from psycopg.conninfo import make_conninfo

from .errors import ValidationError


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def _reject_constant(_value):
    raise ValueError()


def secret_database_url(*, region=None):
    secret_id = os.environ.get("RDS_SECRET_ID")
    if not secret_id or not secret_id.strip():
        raise ValidationError("RDS_SECRET_ID is not configured")
    certificate = os.environ.get("RDS_SSL_ROOT_CERT")
    if not certificate:
        raise ValidationError("RDS_SSL_ROOT_CERT must identify the AWS CA bundle")
    try:
        ssl.create_default_context(cafile=certificate)
    except (OSError, ssl.SSLError, ValueError):
        raise ValidationError("RDS CA bundle must be a readable PEM certificate file") from None
    with closing(boto3.client(
        "secretsmanager",
        region_name=region or os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION"),
        config=Config(connect_timeout=10, read_timeout=30,
                      retries={"mode": "standard", "total_max_attempts": 3}),
    )) as client:
        response = client.get_secret_value(SecretId=secret_id)
    raw = response.get("SecretString")
    if not isinstance(raw, str):
        raise ValidationError("RDS secret must contain a JSON SecretString")
    try:
        secret = json.loads(raw, object_pairs_hook=_unique_object, parse_constant=_reject_constant)
    except (ValueError, RecursionError):
        raise ValidationError("RDS secret must be valid JSON with unique keys and finite values") from None
    if not isinstance(secret, dict):
        raise ValidationError("RDS secret must be a JSON object")
    for field in ("username", "password", "host", "dbname"):
        value = secret.get(field)
        if not isinstance(value, str) or not value.strip() or "\0" in value:
            raise ValidationError(f"RDS secret field {field} must be a nonempty string without NUL characters")
    # Require a single DNS hostname: no Unix socket paths, host lists or DSN fragments.
    host = secret["host"]
    if len(host) > 253 or not all(re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?", label)
                                  for label in host.split(".")):
        raise ValidationError("RDS secret field host must be a DNS hostname")
    port = secret.get("port")
    if not (type(port) is int or isinstance(port, str) and re.fullmatch(r"[0-9]{1,5}", port)):
        raise ValidationError("RDS secret field port must be an integer from 1 to 65535")
    if not 1 <= int(port) <= 65535:
        raise ValidationError("RDS secret field port must be an integer from 1 to 65535")
    try:
        # libpq escaping preserves special password characters. Extra secret fields
        # cannot inject connection options or override certificate/hostname verification.
        return make_conninfo(user=secret["username"], password=secret["password"],
                             host=host, port=str(port), dbname=secret["dbname"],
                             sslmode="verify-full", sslrootcert=certificate)
    except Exception:
        raise ValidationError("RDS secret fields are not valid PostgreSQL connection configuration") from None
