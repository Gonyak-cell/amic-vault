from __future__ import annotations

import subprocess
import re
from pathlib import Path

import pytest

from app.converters import docx_to_pdf
from app.converters.docx_to_pdf import (
    DocxToPdfConversionError,
    convert_docx_bytes_to_pdf,
    convert_office_bytes_to_pdf,
    office_converter_profile_sha256,
)


@pytest.fixture(autouse=True)
def reset_profile_cache():
    office_converter_profile_sha256.cache_clear()
    yield
    office_converter_profile_sha256.cache_clear()


def test_docx_converter_invokes_libreoffice_and_returns_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        outdir = Path(cmd[cmd.index("--outdir") + 1])
        (outdir / "source.pdf").write_bytes(b"%PDF-1.7\nconverted")
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr("app.converters.docx_to_pdf.run_bounded_subprocess", fake_run)
    assert convert_docx_bytes_to_pdf(b"PK\x03\x04docx") == b"%PDF-1.7\nconverted"


def test_office_converter_accepts_legacy_compound_payloads(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(cmd: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        outdir = Path(cmd[cmd.index("--outdir") + 1])
        (outdir / "source.pdf").write_bytes(b"%PDF-1.7\nconverted")
        return subprocess.CompletedProcess(cmd, 0)

    monkeypatch.setattr("app.converters.docx_to_pdf.run_bounded_subprocess", fake_run)
    assert convert_office_bytes_to_pdf(b"\xd0\xcf\x11\xe0legacy", "source.ppt") == (
        b"%PDF-1.7\nconverted"
    )


def test_docx_converter_fails_closed_for_invalid_payload() -> None:
    with pytest.raises(DocxToPdfConversionError):
        convert_docx_bytes_to_pdf(b"not-a-docx")


def test_profile_changes_with_engine_font_bytes_and_conversion_options(monkeypatch, tmp_path) -> None:
    font = tmp_path / "fixture.ttf"
    font.write_bytes(b"synthetic font version 1")
    version = b"LibreOffice 1.0 test build"
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command)
        assert kwargs["check"] is True
        assert kwargs["timeout_seconds"] == 5
        output = version if command[-1] == "--version" else f"{font}\n".encode()
        return subprocess.CompletedProcess(command, 0, stdout=output)

    monkeypatch.setattr(docx_to_pdf, "run_bounded_subprocess", fake_run)
    first = office_converter_profile_sha256()
    assert re.fullmatch(r"[a-f0-9]{64}", first)
    assert office_converter_profile_sha256() == first
    assert len(calls) == 2
    office_converter_profile_sha256.cache_clear()
    version = b"LibreOffice 2.0 test build"
    second = office_converter_profile_sha256()
    assert second != first
    office_converter_profile_sha256.cache_clear()
    font.write_bytes(b"synthetic font version 2")
    third = office_converter_profile_sha256()
    assert third != second
    office_converter_profile_sha256.cache_clear()
    monkeypatch.setattr(docx_to_pdf, "office_pdf_options", (*docx_to_pdf.office_pdf_options, "--test-option"))
    assert office_converter_profile_sha256() != third


@pytest.mark.parametrize("case", ["missing-version", "no-fonts", "unreadable-font"])
def test_profile_fails_closed_without_engine_or_font_evidence(monkeypatch, tmp_path, case) -> None:
    def fake_run(command, **kwargs):
        if command[-1] == "--version":
            output = b"" if case == "missing-version" else b"LibreOffice 1.0 test build"
        else:
            output = b"" if case == "no-fonts" else f"{tmp_path / 'missing.ttf'}\n".encode()
        return subprocess.CompletedProcess(command, 0, stdout=output)

    monkeypatch.setattr(docx_to_pdf, "run_bounded_subprocess", fake_run)
    with pytest.raises(DocxToPdfConversionError):
        office_converter_profile_sha256()


def test_profile_identifies_the_installed_libreoffice_and_fonts() -> None:
    assert re.fullmatch(r"[a-f0-9]{64}", office_converter_profile_sha256())
