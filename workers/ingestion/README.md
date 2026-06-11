# Ingestion Worker

Python 3.12 FastAPI worker for parsing and OCR. R0 exposes only `/health`.

R2 will add signed API-to-worker extraction endpoints. The worker must remain stateless and must
not access the application database directly.
