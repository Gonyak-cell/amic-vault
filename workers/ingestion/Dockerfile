FROM ghcr.io/astral-sh/uv:0.11.15@sha256:e590846f4776907b254ac0f44b5b380347af5d90d668138ca7938d1b0c2f98d3 AS uv
FROM python:3.12-slim
WORKDIR /worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_NO_CACHE=1 \
  PATH="/worker/.venv/bin:${PATH}"
COPY workers/ingestion/pyproject.toml workers/ingestion/uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev
COPY workers/ingestion/app ./app
RUN uv sync --frozen --no-dev --no-editable
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
