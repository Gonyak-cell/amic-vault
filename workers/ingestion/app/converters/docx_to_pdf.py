from __future__ import annotations

import tempfile
from pathlib import Path
from shutil import which

from app.resource_policy import (
    ParserLimitExceeded,
    ParserSubprocessFailed,
    assert_input_bytes,
    assert_output_bytes,
    assert_wall_time,
    parser_profile,
    run_bounded_subprocess,
    start_wall_clock,
)


class DocxToPdfConversionError(Exception):
    """Raised when LibreOffice cannot produce a PDF derivative."""


office_pdf_extensions = {"doc", "docx", "xls", "xlsx", "ppt", "pptx"}
openxml_extensions = {"docx", "xlsx", "pptx"}
legacy_office_signature = b"\xd0\xcf\x11\xe0"


def libreoffice_command() -> str:
    return which("libreoffice") or which("soffice") or "libreoffice"


def _extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    return name.rsplit(".", 1)[-1] if "." in name else ""


def convert_office_bytes_to_pdf(
    payload: bytes,
    filename: str,
    timeout_seconds: int = 30,
) -> bytes:
    profile = parser_profile("convert")
    started_at = start_wall_clock()
    assert_input_bytes(profile, len(payload))
    extension = _extension(filename)
    if extension not in office_pdf_extensions:
        raise DocxToPdfConversionError("unsupported office preview extension")
    if extension in openxml_extensions and not payload.startswith(b"PK"):
        raise DocxToPdfConversionError("input is not an openxml zip payload")
    if extension not in openxml_extensions and not payload.startswith(legacy_office_signature):
        raise DocxToPdfConversionError("input is not a legacy office compound payload")

    with tempfile.TemporaryDirectory(prefix="amic-preview-") as tmp:
        workdir = Path(tmp)
        source = workdir / f"source.{extension}"
        source.write_bytes(payload)
        try:
            run_bounded_subprocess(
                [
                    libreoffice_command(),
                    f"-env:UserInstallation={workdir.joinpath('lo-profile').as_uri()}",
                    "--headless",
                    "--nologo",
                    "--nofirststartwizard",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(workdir),
                    str(source),
                ],
                profile_name="convert",
                cwd=workdir,
                check=True,
                timeout_seconds=timeout_seconds,
            )
        except ParserSubprocessFailed as exc:
            raise DocxToPdfConversionError("libreoffice conversion failed") from exc

        output = workdir / "source.pdf"
        if not output.exists():
            raise DocxToPdfConversionError("libreoffice did not write a pdf")
        if output.stat().st_size > profile.max_output_bytes:
            raise DocxToPdfConversionError("converted output exceeds policy")
        pdf = output.read_bytes()
        if not pdf.startswith(b"%PDF"):
            raise DocxToPdfConversionError("converted output is not a pdf")
        try:
            assert_output_bytes(profile, pdf)
            assert_wall_time(profile, started_at)
        except ParserLimitExceeded as exc:
            raise DocxToPdfConversionError("conversion resource policy exceeded") from exc
        return pdf


def convert_docx_bytes_to_pdf(payload: bytes, timeout_seconds: int = 30) -> bytes:
    return convert_office_bytes_to_pdf(payload, "source.docx", timeout_seconds)
