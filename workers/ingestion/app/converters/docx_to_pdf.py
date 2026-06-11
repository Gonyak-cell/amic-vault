from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path


class DocxToPdfConversionError(Exception):
    """Raised when LibreOffice cannot produce a PDF derivative."""


def convert_docx_bytes_to_pdf(payload: bytes, timeout_seconds: int = 30) -> bytes:
    if not payload.startswith(b"PK"):
        raise DocxToPdfConversionError("input is not a docx zip payload")

    with tempfile.TemporaryDirectory(prefix="amic-preview-") as tmp:
        workdir = Path(tmp)
        source = workdir / "source.docx"
        source.write_bytes(payload)
        try:
            subprocess.run(
                [
                    "libreoffice",
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
