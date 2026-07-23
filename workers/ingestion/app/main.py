import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .convert_router import router as convert_router
from .email_router import router as email_router
from .extract_router import router as extract_router
from .ocr_router import router as ocr_router
from .security_router import router as security_router
from .service_identity import (
    InMemoryNonceReplayStore,
    ServiceIdentityDenied,
    assert_service_identity_profile,
    verify_ingestion_request_identity,
)
from .zip_router import router as zip_router

app = FastAPI(title="AMIC Vault Ingestion Worker")
app.include_router(convert_router)
app.include_router(email_router)
app.include_router(extract_router)
app.include_router(ocr_router)
app.include_router(security_router)
app.include_router(zip_router)

_identity_nonce_store = InMemoryNonceReplayStore()


@app.middleware("http")
async def enforce_ingestion_service_identity(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    try:
        request.state.ingestion_identity = verify_ingestion_request_identity(
            request.headers,
            env=os.environ,
            nonce_store=_identity_nonce_store,
        )
    except ServiceIdentityDenied:
        return JSONResponse(status_code=403, content={"detail": {"code": "PERMISSION_DENIED"}})
    return await call_next(request)


@app.on_event("startup")
def assert_ingestion_identity_profile() -> None:
    try:
        assert_service_identity_profile(os.environ)
    except ServiceIdentityDenied as exc:
        raise RuntimeError("INGESTION_WORKER_IDENTITY_CONFIGURATION_INVALID") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
