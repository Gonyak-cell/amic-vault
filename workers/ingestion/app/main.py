from fastapi import FastAPI
from .convert_router import router as convert_router
from .email_router import router as email_router
from .extract_router import router as extract_router
from .ocr_router import router as ocr_router
from .security_router import router as security_router
from .zip_router import router as zip_router

app = FastAPI(title="AMIC Vault Ingestion Worker")
app.include_router(convert_router)
app.include_router(email_router)
app.include_router(extract_router)
app.include_router(ocr_router)
app.include_router(security_router)
app.include_router(zip_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
