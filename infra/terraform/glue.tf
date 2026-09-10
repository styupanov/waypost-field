resource "aws_glue_catalog_database" "analytics" {
  name       = "travel_analytics"
  catalog_id = "954976315093"

  create_table_default_permission {
    permissions = ["ALL"]
    principal {
      data_lake_principal_identifier = "IAM_ALLOWED_PRINCIPALS"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_glue_catalog_table" "routes" {
  name          = "routes"
  database_name = aws_glue_catalog_database.analytics.name
  catalog_id    = "954976315093"
  owner         = "hadoop"
  retention     = 0
  table_type    = "EXTERNAL_TABLE"

  parameters = {
    EXTERNAL                    = "TRUE"
    "projection.day.digits"     = "2"
    "projection.day.range"      = "1,31"
    "projection.day.type"       = "integer"
    "projection.enabled"        = "true"
    "projection.month.digits"   = "2"
    "projection.month.range"    = "1,12"
    "projection.month.type"     = "integer"
    "projection.year.digits"    = "4"
    "projection.year.range"     = "2026,2030"
    "projection.year.type"      = "integer"
    "storage.location.template" = "s3://geospatial-learning-sergei-2026/analytics/routing/routes/year=$${year}/month=$${month}/day=$${day}/"
  }

  storage_descriptor {
    location                  = "s3://geospatial-learning-sergei-2026/analytics/routing/routes"
    input_format              = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat"
    output_format             = "org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat"
    compressed                = false
    number_of_buckets         = -1
    stored_as_sub_directories = false

    columns {
      name = "analytics_schema_version"
      type = "smallint"
    }
    columns {
      name = "provider"
      type = "string"
    }
    columns {
      name = "route_index"
      type = "int"
    }
    columns {
      name = "fetched_at"
      type = "timestamp"
    }
    columns {
      name = "processed_at"
      type = "timestamp"
    }
    columns {
      name = "transform_version"
      type = "string"
    }
    columns {
      name = "section_count"
      type = "int"
    }
    columns {
      name = "distance_meters"
      type = "bigint"
    }
    columns {
      name = "duration_seconds"
      type = "bigint"
    }
    columns {
      name = "base_duration_seconds"
      type = "bigint"
    }
    columns {
      name = "raw_s3_bucket"
      type = "string"
    }
    columns {
      name = "raw_s3_key"
      type = "string"
    }
    columns {
      name = "processed_s3_bucket"
      type = "string"
    }
    columns {
      name = "processed_s3_key"
      type = "string"
    }
    columns {
      name = "geometry"
      type = "binary"
    }

    ser_de_info {
      serialization_library = "org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe"
      parameters = {
        "serialization.format" = "1"
      }
    }

    skewed_info {
      skewed_column_names               = []
      skewed_column_values              = []
      skewed_column_value_location_maps = {}
    }
  }

  partition_keys {
    name = "year"
    type = "string"
  }
  partition_keys {
    name = "month"
    type = "string"
  }
  partition_keys {
    name = "day"
    type = "string"
  }

  lifecycle {
    prevent_destroy = true
    # Athena/Hive maintains these audit timestamps and actor metadata.
    # Keep semantic table parameters drift-detectable while sharing these keys.
    ignore_changes = [
      parameters["last_modified_by"],
      parameters["last_modified_time"],
      parameters["transient_lastDdlTime"],
    ]
  }
}
