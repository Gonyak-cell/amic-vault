from fastapi import FastAPI

app = FastAPI(title="AMIC Vault Ingestion Worker")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
