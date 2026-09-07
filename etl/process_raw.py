"""Run from the repository root: python etl/process_raw.py --bucket ... --key ..."""

from waypost_etl.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
