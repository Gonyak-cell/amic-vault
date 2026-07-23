import os
from threading import Lock

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .convert_router import router as convert_router
from .egress_policy import EgressPolicyDenied, assert_egress_profile
from .email_router import router as email_router
from .extract_router import router as extract_router
from .ocr_router import router as ocr_router
from .security_router import router as security_router
from .service_identity import (
    InMemoryNonceReplayStore,
    NonceReplayStore,
    ServiceIdentityDenied,
    assert_service_identity_profile,
    create_nonce_replay_store,
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

_identity_nonce_store: NonceReplayStore = InMemoryNonceReplayStore()
_identity_nonce_store_key = ("loopback-dev", "")
_identity_nonce_store_lock = Lock()


def _configured_nonce_store() -> NonceReplayStore:
    global _identity_nonce_store, _identity_nonce_store_key
    key = (
        os.environ.get("INGESTION_WORKER_IDENTITY_PROFILE", "loopback-dev"),
        os.environ.get("INGESTION_NONCE_STORE_PATH", ""),
    )
    with _identity_nonce_store_lock:
        if key != _identity_nonce_store_key:
            _identity_nonce_store = create_nonce_replay_store(os.environ)
            _identity_nonce_store_key = key
        return _identity_nonce_store


@app.middleware("http")
async def enforce_ingestion_service_identity(request: Request, call_next):
    if request.url.path == "/health":
        return await call_next(request)
    try:
        request.state.ingestion_identity = verify_ingestion_request_identity(
            request.headers,
            env=os.environ,
            nonce_store=_configured_nonce_store(),
        )
    except ServiceIdentityDenied:
        return JSONResponse(status_code=403, content={"detail": {"code": "PERMISSION_DENIED"}})
    return await call_next(request)


@app.on_event("startup")
def assert_ingestion_identity_profile() -> None:
    try:
        assert_service_identity_profile(os.environ)
        assert_egress_profile(os.environ)
        _configured_nonce_store()
    except (ServiceIdentityDenied, EgressPolicyDenied) as exc:
        raise RuntimeError("INGESTION_WORKER_IDENTITY_CONFIGURATION_INVALID") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
