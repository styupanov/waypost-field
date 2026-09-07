import io
import json
import logging
import os
import ssl
import unittest
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
from psycopg.conninfo import conninfo_to_dict

from waypost_etl.database import database_url
from waypost_etl.errors import ValidationError
from waypost_etl.load_cli import main


class SecretDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.env = {"RDS_SECRET_ID": "test/secret", "RDS_SSL_ROOT_CERT": "test-ca.pem",
                    "AWS_REGION": "us-east-1", "AWS_PROFILE": "travel-dev",
                    "RDS_DATABASE_URL": "must-not-use", "DATABASE_URL": "must-not-use",
                    "PGSSLMODE": "disable"}
        self.secret = {"username": "etl", "password": "private ' \\ @:/?=& value",
                       "host": "db.example.com", "port": 5432, "dbname": "travel"}
        self.enterContext(patch.dict(os.environ, self.env, clear=True))
        self.client = Mock(spec=["get_secret_value", "close"])
        self.factory = self.enterContext(patch("waypost_etl.secret_database.boto3.client", return_value=self.client))
        self.tls = self.enterContext(patch("waypost_etl.secret_database.ssl.create_default_context"))
        self.dotenv = self.enterContext(patch("waypost_etl.database.dotenv_values", side_effect=AssertionError("No dotenv in runtime")))
        self.respond(self.secret)

    def tearDown(self):
        logging.getLogger("waypost_etl").handlers = [logging.NullHandler()]

    def respond(self, value):
        self.client.get_secret_value.return_value = {"SecretString": json.dumps(value)}

    def test_credential_chain_tls_and_escaping(self):
        self.secret.update(sslmode="disable", sslrootcert="untrusted.pem")
        self.respond(self.secret)
        result = conninfo_to_dict(database_url(target="rds-secret", region="us-west-2"))
        self.assertEqual(result, {"user": "etl", "password": self.secret["password"],
                                 "host": "db.example.com", "port": "5432", "dbname": "travel",
                                 "sslmode": "verify-full", "sslrootcert": "test-ca.pem"})
        self.client.get_secret_value.assert_called_once_with(SecretId="test/secret")
        self.client.close.assert_called_once()
        self.tls.assert_called_once_with(cafile="test-ca.pem")
        self.assertEqual(self.factory.call_args.args, ("secretsmanager",))
        self.assertEqual(set(self.factory.call_args.kwargs), {"region_name", "config"})
        self.assertEqual(self.factory.call_args.kwargs["region_name"], "us-west-2")
        self.assertEqual(dict(os.environ), self.env)
        self.dotenv.assert_not_called()

    def test_region_fallback_and_string_port(self):
        self.secret["port"] = "5432"
        self.respond(self.secret)
        database_url(target="rds-secret")
        self.assertEqual(self.factory.call_args.kwargs["region_name"], "us-east-1")
        del os.environ["AWS_REGION"]
        os.environ["AWS_DEFAULT_REGION"] = "us-west-1"
        database_url(target="rds-secret")
        self.assertEqual(self.factory.call_args.kwargs["region_name"], "us-west-1")
        del os.environ["AWS_DEFAULT_REGION"]
        database_url(target="rds-secret")
        self.assertIsNone(self.factory.call_args.kwargs["region_name"])

    def test_missing_runtime_config_and_invalid_ca_fail_before_aws(self):
        for field in ("RDS_SECRET_ID", "RDS_SSL_ROOT_CERT"):
            with self.subTest(field=field), patch.dict(os.environ, {field: ""}):
                with self.assertRaisesRegex(ValidationError, field):
                    database_url(target="rds-secret")
        for error in (OSError("private value"), ssl.SSLError("private value")):
            self.tls.side_effect = error
            with self.assertRaisesRegex(ValidationError, "readable PEM"):
                database_url(target="rds-secret")
        self.factory.assert_not_called()

    def test_missing_or_invalid_fields(self):
        for field in self.secret:
            for value in (None, "", [], True):
                record = {**self.secret, field: value}
                self.respond(record)
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValidationError, field):
                    database_url(target="rds-secret")
            record = dict(self.secret)
            del record[field]
            self.respond(record)
            with self.assertRaisesRegex(ValidationError, field):
                database_url(target="rds-secret")
        for port in (0, 65536, -1, 5432.0, "5432 sslmode=disable"):
            self.respond({**self.secret, "port": port})
            with self.assertRaisesRegex(ValidationError, "port"):
                database_url(target="rds-secret")
        for host in ("/tmp", "db.example.com,other", "db.example.com sslmode=disable", "https://db.example.com", "db\0host"):
            self.respond({**self.secret, "host": host})
            with self.assertRaisesRegex(ValidationError, "host"):
                database_url(target="rds-secret")

    def test_malformed_json_and_secret_string_required(self):
        for raw in ('{"password":"private-value"', '{"x":1,"x":2}', '{"x":NaN}', 'null', '[]'):
            self.client.get_secret_value.return_value = {"SecretString": raw}
            with self.assertRaisesRegex(ValidationError, "JSON") as raised:
                database_url(target="rds-secret")
            self.assertNotIn("private-value", str(raised.exception))
        self.client.get_secret_value.return_value = {"SecretBinary": b"private-value"}
        with self.assertRaisesRegex(ValidationError, "SecretString"):
            database_url(target="rds-secret")

    def test_cli_sanitizes_secret_errors_even_in_debug_mode(self):
        self.client.get_secret_value.side_effect = ClientError(
            {"Error": {"Code": "AccessDeniedException", "Message": self.secret["password"]}}, "GetSecretValue")
        with patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--target", "rds-secret", "--bucket", "test", "--key", "processed/test", "--debug"]), 1)
        event = json.loads(output.getvalue())
        self.assertEqual(event["awsErrorCode"], "AccessDeniedException")
        self.assertNotIn("private", output.getvalue())
        self.client.close.assert_called_once()
        self.client.get_secret_value.side_effect = None
        self.client.get_secret_value.return_value = {"SecretString": '{"password":"private-value"'}
        with patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--target", "rds-secret", "--bucket", "test", "--key", "processed/test", "--debug"]), 1)
        self.assertIn("valid JSON", json.loads(output.getvalue())["reason"])
        self.assertNotIn("private-value", output.getvalue())

    def test_cli_success_passes_secret_configuration_without_logging_it(self):
        s3 = Mock(spec=["close"])
        self.factory.side_effect = [self.client, s3]
        with patch("waypost_etl.load_cli.load_object", return_value=1) as load, patch("sys.stderr", new_callable=io.StringIO) as output:
            self.assertEqual(main(["--target", "rds-secret", "--bucket", "test", "--key", "processed/test"]), 0)
        self.assertEqual(conninfo_to_dict(load.call_args.args[3])["password"], self.secret["password"])
        self.assertEqual(json.loads(output.getvalue())["event"], "load_succeeded")
        self.assertNotIn("private", output.getvalue())
