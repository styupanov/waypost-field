"""Run from repository root: python etl/write_route_parquet.py --bucket ... --key ..."""

from waypost_etl.analytics_cli import main

if __name__ == "__main__":
    raise SystemExit(main())
