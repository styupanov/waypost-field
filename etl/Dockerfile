# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm@sha256:ed86c82274b3c69b52fb5820f358f0bd7df0b603332063cb5c6e32bd220c3e6e

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    RDS_SSL_ROOT_CERT=/app/certs/global-bundle.pem

WORKDIR /app
COPY requirements.lock /app/requirements.lock
RUN python -m pip install --no-cache-dir --only-binary=:all: -r /app/requirements.lock

# Public AWS trust bundle, pinned independently of the mutable upstream URL.
# A changed bundle fails the build until its new digest is explicitly reviewed.
RUN python -c "import hashlib,pathlib,ssl,urllib.request; data=urllib.request.urlopen('https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem',timeout=30).read(); assert hashlib.sha256(data).hexdigest() == 'e5bb2084ccf45087bda1c9bffdea0eb15ee67f0b91646106e466714f9de3c7e3', 'RDS CA checksum mismatch'; p=pathlib.Path('/app/certs/global-bundle.pem'); p.parent.mkdir(); p.write_bytes(data); ssl.create_default_context(cafile=str(p))"

RUN groupadd --gid 10001 etl && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin etl
COPY waypost_etl/ /app/etl/waypost_etl/
COPY process_raw.py load_processed.py verify_loaded.py write_route_parquet.py /app/etl/
USER 10001:10001

# ECS command overrides include the script path followed by its normal CLI arguments.
ENTRYPOINT ["python"]
CMD ["etl/load_processed.py", "--help"]
