from __future__ import annotations

from dataclasses import asdict
from functools import lru_cache
import hashlib
import json
import os
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
office_pdf_options = ("--headless", "--nologo", "--nofirststartwizard", "--convert-to", "pdf")
office_pdf_timeout_seconds = 30


def libreoffice_command() -> str:
    return which("libreoffice") or which("soffice") or "libreoffice"


@lru_cache(maxsize=1)
def office_converter_profile_sha256() -> str:
    # The worker image, installed fonts and converter settings are immutable per process.
    profile = parser_profile("convert")
    started_at = start_wall_clock()
    try:
        version = run_bounded_subprocess(
            [libreoffice_command(), "--version"],
            profile_name="convert", timeout_seconds=5, check=True,
        ).stdout.decode("utf-8").strip()
        if not version.startswith("LibreOffice ") or len(version) > 512:
            raise DocxToPdfConversionError("converter version unavailable")
        font_list = run_bounded_subprocess(
            [which("fc-list") or "fc-list", "--format=%{file}\\n"],
            profile_name="convert", timeout_seconds=5, check=True,
        ).stdout.decode("utf-8").splitlines()
        font_files = sorted(set(font_list))
        if not font_files or len(font_files) > 5000:
            raise DocxToPdfConversionError("converter fonts unavailable")
        fonts = hashlib.sha256()
        total = 0
        for filename in font_files:
            fonts.update(filename.encode("utf-8") + b"\x00")
            digest = hashlib.sha256()
            with Path(filename).open("rb") as font:
                while chunk := font.read(1024 * 1024):
                    total += len(chunk)
                    if total > 512 * 1024 * 1024:
                        raise DocxToPdfConversionError("converter font inventory exceeds policy")
                    assert_wall_time(profile, started_at)
                    digest.update(chunk)
            fonts.update(digest.digest())
        recipe = {
            "schema": "office-pdf-v1",
            "libreoffice_version": version,
            "converter_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "font_inventory_sha256": fonts.hexdigest(),
            "options": office_pdf_options,
            "timeout_seconds": office_pdf_timeout_seconds,
            "resource_policy": asdict(profile),
            "environment": {key: os.environ.get(key, "") for key in (
                "LANG", "LC_ALL", "LC_CTYPE", "LC_NUMERIC", "LC_TIME", "TZ",
                "SAL_USE_VCLPLUGIN", "FONTCONFIG_FILE", "FONTCONFIG_PATH",
            )},
        }
        assert_wall_time(profile, started_at)
        return hashlib.sha256(json.dumps(recipe, sort_keys=True).encode("utf-8")).hexdigest()
    except (OSError, UnicodeError, ParserSubprocessFailed, ParserLimitExceeded) as exc:
        raise DocxToPdfConversionError("converter profile unavailable") from exc


def _extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    return name.rsplit(".", 1)[-1] if "." in name else ""


def convert_office_bytes_to_pdf(
    payload: bytes,
    filename: str,
    timeout_seconds: int = office_pdf_timeout_seconds,
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
                    *office_pdf_options,
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
