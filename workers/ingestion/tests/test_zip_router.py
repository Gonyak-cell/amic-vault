from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi.testclient import TestClient

from app.main import app
from app.zip_router import inspect_zip_payload

TENANT_ID = "11111111-1111-4111-8111-111111111111"
BATCH_ID = "11111111-1111-4111-8111-111111111177"

client = TestClient(app)


def _zip(files: dict[str, bytes], compression: int = ZIP_DEFLATED) -> bytes:
    output = BytesIO()
    with ZipFile(output, "w", compression) as archive:
        for name, body in files.items():
            archive.writestr(name, body)
    return output.getvalue()


def _post_zip(payload: bytes, tenant_id: str = TENANT_ID):
    return client.post(
        "/zip/inspect",
        data={"tenant_id": tenant_id, "batch_id": BATCH_ID},
        files={"file": ("batch.zip", payload, "application/zip")},
        headers={"x-amic-tenant-id": tenant_id},
    )


def test_zip_router_returns_safe_item_list() -> None:
    response = _post_zip(
        _zip(
            {
                "contracts/one.pdf": b"%PDF-1.7 first",
                "notes/two.txt": "검토 메모".encode("utf-8"),
            }
        )
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "ready"
    assert body["item_count"] == 2
    assert [item["path"] for item in body["items"]] == ["contracts/one.pdf", "notes/two.txt"]
    assert all(len(item["sha256"]) == 64 for item in body["items"])


def test_zip_router_rejects_zip_bomb_and_path_traversal() -> None:
    bomb = _zip({"huge.txt": b"A" * 200_000})
    traversal = _zip({"../escape.pdf": b"%PDF-1.7"})

    for payload, reason in [
        (bomb, "ZIP_COMPRESSION_RATIO_EXCEEDED"),
        (traversal, "ZIP_PATH_TRAVERSAL"),
    ]:
        response = _post_zip(payload)
        assert response.status_code == 400, response.text
        assert reason in response.text


def test_zip_inspector_rejects_non_zip_magic() -> None:
    response = _post_zip(b"not a zip")

    assert response.status_code == 415
    assert "UNSUPPORTED_FILE_TYPE" in response.text


def test_zip_helper_rejects_backslash_traversal() -> None:
    try:
        inspect_zip_payload(_zip({"folder\\..\\escape.txt": b"denied"}))
    except Exception as exc:
        assert "ZIP_PATH_TRAVERSAL" in str(exc)
    else:
        raise AssertionError("expected traversal rejection")
