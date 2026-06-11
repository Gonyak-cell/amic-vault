FROM python:3.12-slim
WORKDIR /worker
COPY workers/ingestion/pyproject.toml ./
COPY workers/ingestion/app ./app
RUN pip install --no-cache-dir "fastapi>=0.115,<1" "uvicorn[standard]>=0.34,<1"
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
