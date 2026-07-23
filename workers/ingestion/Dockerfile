FROM ghcr.io/astral-sh/uv:0.11.15@sha256:e590846f4776907b254ac0f44b5b380347af5d90d668138ca7938d1b0c2f98d3 AS uv
FROM docker.io/library/python:3.12-slim@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de
WORKDIR /worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --gid 10001 amic-ingestion \
  && useradd --uid 10001 --gid 10001 --no-create-home --home-dir /tmp/amic-home --shell /usr/sbin/nologin amic-ingestion
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_NO_CACHE=1 \
  HOME=/tmp/amic-home \
  XDG_CACHE_HOME=/tmp/amic-cache \
  XDG_CONFIG_HOME=/tmp/amic-config \
  TMPDIR=/tmp \
  SAL_USE_VCLPLUGIN=svp \
  PATH="/worker/.venv/bin:${PATH}"
COPY workers/ingestion/pyproject.toml workers/ingestion/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY workers/ingestion/app ./app
RUN uv sync --frozen --no-dev --no-editable \
  && mkdir -p /var/lib/amic-vault/replay \
  && chown -R 10001:10001 /worker /var/lib/amic-vault
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
