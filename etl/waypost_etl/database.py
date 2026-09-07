"""Isolated administrative database targets; local remains the default."""

import os
import ssl
from pathlib import Path
from urllib.parse import urlsplit, parse_qsl

from dotenv import dotenv_values
from psycopg.conninfo import make_conninfo

from .errors import ValidationError

DEFAULT_ENV_FILE = Path(__file__).resolve().parents[2] / ".env.local"


def database_url(env_file=DEFAULT_ENV_FILE, *, target="local"):
    # Read only the selected DB settings; never copy other .env values into logs.
    if target not in ("local", "rds"):
        raise ValidationError("Database target must be local or rds")
    values = None

    def setting(name):
        nonlocal values
        if name in os.environ:
            return os.environ[name]
        if values is None:
            values = dotenv_values(env_file, interpolate=False) if env_file is not None else {}
        return values.get(name)

    name = "RDS_DATABASE_URL" if target == "rds" else "DATABASE_URL"
    value = setting(name)
    if not value:
        raise ValidationError(f"{name} is not configured")
    if target == "local":
        return value
    try:
        url = urlsplit(value)
        if url.scheme not in ("postgres", "postgresql") or not url.hostname or not url.username or len(url.path) < 2 or url.fragment:
            raise ValueError()
        parameters = parse_qsl(url.query, keep_blank_values=True)
    except ValueError as error:
        raise ValidationError("RDS_DATABASE_URL must be a PostgreSQL URL with host, user, and database") from error
    if any(name not in ("sslmode", "sslrootcert") for name, _ in parameters) or len(dict(parameters)) != len(parameters):
        raise ValidationError("RDS URL query supports only sslmode and sslrootcert")
    parameters = dict(parameters)
    if "sslmode" in parameters and parameters["sslmode"] != "verify-full":
        raise ValidationError("RDS requires sslmode=verify-full")
    certificate = setting("RDS_SSL_ROOT_CERT") or parameters.get("sslrootcert")
    if not certificate:
        raise ValidationError("RDS_SSL_ROOT_CERT or URL sslrootcert must identify the AWS CA bundle")
    try:
        ssl.create_default_context(cafile=certificate)
    except (OSError, ssl.SSLError) as error:
        raise ValidationError("RDS CA bundle must be a readable PEM certificate file") from error
    try:
        # Explicit connection parameters override libpq's PGSSLMODE environment default.
        return make_conninfo(value, sslmode="verify-full", sslrootcert=certificate)
    except Exception as error:
        raise ValidationError("RDS_DATABASE_URL is not valid PostgreSQL connection configuration") from error
