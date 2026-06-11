from fastapi import FastAPI
from .extract_router import router as extract_router

app = FastAPI(title="AMIC Vault Ingestion Worker")
app.include_router(extract_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
