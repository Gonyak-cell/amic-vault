FROM python:3.12-slim
WORKDIR /worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends libreoffice-writer libreoffice-calc libreoffice-impress fonts-dejavu tesseract-ocr tesseract-ocr-kor tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*
COPY workers/ingestion/pyproject.toml ./
COPY workers/ingestion/app ./app
RUN pip install --no-cache-dir .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
