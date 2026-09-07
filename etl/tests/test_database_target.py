import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from psycopg.conninfo import conninfo_to_dict

from waypost_etl.database import database_url
from waypost_etl.errors import ValidationError


class RdsTargetTests(unittest.TestCase):
    def test_default_stays_local_and_rds_never_falls_back(self):
        with patch.dict(os.environ, {"DATABASE_URL": "local-placeholder", "RDS_DATABASE_URL": "rds-placeholder"}, clear=True):
            self.assertEqual(database_url(None), "local-placeholder")
        with patch.dict(os.environ, {"DATABASE_URL": "local-placeholder"}, clear=True):
            with self.assertRaisesRegex(ValidationError, "RDS_DATABASE_URL"):
                database_url(None, target="rds")

    @patch("waypost_etl.database.ssl.create_default_context")
    def test_rds_forces_full_tls_verification_without_mutating_environment(self, tls):
        env = {"RDS_DATABASE_URL": "postgresql://rds:placeholder@db.example.com/travel", "RDS_SSL_ROOT_CERT": "C:/certs/global-bundle.pem", "DATABASE_URL": "local-placeholder", "PGSSLMODE": "disable"}
        with patch.dict(os.environ, env, clear=True):
            result = conninfo_to_dict(database_url(None, target="rds"))
            self.assertEqual(result["sslmode"], "verify-full")
            self.assertEqual(result["sslrootcert"], env["RDS_SSL_ROOT_CERT"])
            self.assertEqual(result["host"], "db.example.com")
            self.assertEqual(dict(os.environ), env)
        tls.assert_called_once_with(cafile=env["RDS_SSL_ROOT_CERT"])

    def test_rejects_tls_downgrades_and_invalid_ca(self):
        base = "postgresql://rds:placeholder@db.example.com/travel"
        for query in ["sslmode=disable", "sslmode=require", "ssl=no-verify", "sslmode=verify-full&sslmode=disable", "host=localhost"]:
            with patch.dict(os.environ, {"RDS_DATABASE_URL": base + "?" + query}, clear=True), self.subTest(query=query), self.assertRaises(ValidationError):
                database_url(None, target="rds")
        with patch.dict(os.environ, {"RDS_DATABASE_URL": base, "RDS_SSL_ROOT_CERT": "missing-ca.pem"}, clear=True):
            with self.assertRaisesRegex(ValidationError, "readable PEM"):
                database_url(None, target="rds")

    @patch("waypost_etl.database.ssl.create_default_context")
    def test_dedicated_file_and_url_certificate(self, _tls):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / ".env.rds.local"
            config.write_text('RDS_DATABASE_URL="postgresql://rds:placeholder@db.example.com/travel?sslmode=verify-full&sslrootcert=ca.pem"\nDATABASE_URL=ignored-local\n')
            with patch.dict(os.environ, {}, clear=True):
                result = conninfo_to_dict(database_url(config, target="rds"))
                self.assertEqual(result["sslrootcert"], "ca.pem")
                self.assertEqual(result["dbname"], "travel")
                self.assertNotIn("DATABASE_URL", os.environ)
