"""Run: python etl/load_processed.py --bucket ... --key processed/..."""

from waypost_etl.load_cli import main

if __name__ == "__main__":
    raise SystemExit(main())
