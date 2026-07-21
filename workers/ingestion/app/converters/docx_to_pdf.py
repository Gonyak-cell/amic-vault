from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from shutil import which


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
            subprocess.run(
                [
                    libreoffice_command(),
                    "--headless",
                    "--nologo",
                    "--nofirststartwizard",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(workdir),
                    str(source),
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=timeout_seconds,
            )
        except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise DocxToPdfConversionError("libreoffice conversion failed") from exc

        output = workdir / "source.pdf"
        if not output.exists():
            raise DocxToPdfConversionError("libreoffice did not write a pdf")
        pdf = output.read_bytes()
        if not pdf.startswith(b"%PDF"):
            raise DocxToPdfConversionError("converted output is not a pdf")
        return pdf


def convert_docx_bytes_to_pdf(payload: bytes, timeout_seconds: int = 30) -> bytes:
    return convert_office_bytes_to_pdf(payload, "source.docx", timeout_seconds)
