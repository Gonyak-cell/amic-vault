from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from app.converters.docx_to_pdf import DocxToPdfConversionError, convert_docx_bytes_to_pdf


def test_docx_converter_invokes_libreoffice_and_returns_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        outdir = Path(cmd[cmd.index("--outdir") + 1])
        (outdir / "source.pdf").write_bytes(b"%PDF-1.7\nconverted")
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr(subprocess, "run", fake_run)
    assert convert_docx_bytes_to_pdf(b"PK\x03\x04docx") == b"%PDF-1.7\nconverted"


def test_docx_converter_fails_closed_for_invalid_payload() -> None:
    with pytest.raises(DocxToPdfConversionError):
        convert_docx_bytes_to_pdf(b"not-a-docx")
