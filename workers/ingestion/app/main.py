from fastapi import FastAPI
from .convert_router import router as convert_router
from .extract_router import router as extract_router

app = FastAPI(title="AMIC Vault Ingestion Worker")
app.include_router(convert_router)
app.include_router(extract_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
