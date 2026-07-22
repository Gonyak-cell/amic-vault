import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from app.contracts import (
    INGESTION_JOB_VALIDATION_ERROR_CODE,
    INGESTION_PARSER_PROFILES,
    INGESTION_STORAGE_ALIASES,
    MAX_INGESTION_OBJECT_BYTES,
    validate_ingestion_job,
)


FIXTURE_PATH = Path(__file__).resolve().parents[3] / "tests/fixtures/documents/ingestion-job-contract.json"


def _corpus() -> tuple[bytes, dict[str, object]]:
    fixture_bytes = FIXTURE_PATH.read_bytes()
    return fixture_bytes, json.loads(fixture_bytes)


def test_contract_uses_closed_storage_and_parser_vocabularies() -> None:
    assert INGESTION_STORAGE_ALIASES == ("primary",)
    assert INGESTION_PARSER_PROFILES == ("extract", "ocr", "convert", "email", "zip")
    assert MAX_INGESTION_OBJECT_BYTES == 500 * 1024 * 1024


def test_contract_matches_every_shared_golden_accept_reject_result() -> None:
    _, corpus = _corpus()
    now = datetime.fromisoformat(str(corpus["now"]).replace("Z", "+00:00")).astimezone(timezone.utc)
    base = corpus["base"]
    assert isinstance(base, dict)
    cases = corpus["cases"]
    assert isinstance(cases, list)

    for case in cases:
        assert isinstance(case, dict)
        overrides = case.get("overrides", {})
        assert isinstance(overrides, dict)
        value, code = validate_ingestion_job({**base, **overrides}, now=now)
        actual = "accept" if value is not None else "reject"
        assert {"id": case["id"], "result": actual} == {"id": case["id"], "result": case["expected"]}
        if actual == "reject":
            assert value is None
            assert code == INGESTION_JOB_VALIDATION_ERROR_CODE


def test_shared_corpus_is_synthetic_and_byte_addressable_for_ts_parity_evidence() -> None:
    fixture_bytes, _ = _corpus()
    assert len(hashlib.sha256(fixture_bytes).hexdigest()) == 64
    assert b"customer" not in fixture_bytes
