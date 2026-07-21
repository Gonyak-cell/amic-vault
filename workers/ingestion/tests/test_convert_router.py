from fastapi.testclient import TestClient

from app import convert_router
from app.converters.docx_to_pdf import DocxToPdfConversionError
from app.main import app

TENANT_ID = "11111111-1111-4111-8111-111111111111"

client = TestClient(app)


def test_office_to_pdf_accepts_supported_office_extensions(monkeypatch) -> None:
    calls: list[tuple[bytes, str]] = []

    def fake_convert(payload: bytes, filename: str) -> bytes:
        calls.append((payload, filename))
        return b"%PDF-1.7\npreview"

    monkeypatch.setattr(convert_router, "convert_office_bytes_to_pdf", fake_convert)

    for filename in ["source.doc", "source.docx", "sheet.xls", "sheet.xlsx", "deck.ppt", "deck.pptx"]:
        response = client.post(
            "/convert/office-to-pdf",
            data={"tenant_id": TENANT_ID},
            files={"file": (filename, b"office-payload", "application/octet-stream")},
            headers={"x-amic-tenant-id": TENANT_ID},
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/pdf")
        assert response.content.startswith(b"%PDF")

    assert [call[1] for call in calls] == [
        "source.doc",
        "source.docx",
        "sheet.xls",
        "sheet.xlsx",
        "deck.ppt",
        "deck.pptx",
    ]


def test_office_to_pdf_fails_closed_for_tenant_mismatch_and_bad_outputs(monkeypatch) -> None:
    denied = client.post(
        "/convert/office-to-pdf",
        data={"tenant_id": TENANT_ID},
        files={"file": ("sheet.xlsx", b"office-payload", "application/octet-stream")},
        headers={"x-amic-tenant-id": "22222222-2222-4222-8222-222222222222"},
    )
    assert denied.status_code == 403
    assert "TENANT_ISOLATION_VIOLATION" in denied.text

    unsupported = client.post(
        "/convert/office-to-pdf",
        data={"tenant_id": TENANT_ID},
        files={"file": ("payload.txt", b"office-payload", "application/octet-stream")},
        headers={"x-amic-tenant-id": TENANT_ID},
    )
    assert unsupported.status_code == 415
    assert "UNSUPPORTED_FILE_TYPE" in unsupported.text

    def fail_convert(payload: bytes, filename: str) -> bytes:
        raise DocxToPdfConversionError("failed")

    monkeypatch.setattr(convert_router, "convert_office_bytes_to_pdf", fail_convert)
    failed = client.post(
        "/convert/office-to-pdf",
        data={"tenant_id": TENANT_ID},
        files={"file": ("sheet.xlsx", b"office-payload", "application/octet-stream")},
        headers={"x-amic-tenant-id": TENANT_ID},
    )
    assert failed.status_code == 503
    assert "PREVIEW_CONVERSION_UNAVAILABLE" in failed.text
