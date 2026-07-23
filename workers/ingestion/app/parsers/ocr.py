from __future__ import annotations

import tempfile
from collections.abc import Callable
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from app.resource_policy import (
    ParserLimitExceeded,
    ParserSubprocessFailed,
    assert_input_bytes,
    assert_output_text,
    assert_page_count,
    assert_wall_time,
    parser_profile,
    run_bounded_subprocess,
    start_wall_clock,
)

from .types import ExtractionPage, ExtractionResult

OcrTextExtractor = Callable[[bytes, str], str]
PdfRasterizer = Callable[[bytes], list[bytes]]


def pdf_has_text_layer(payload: bytes) -> bool:
    profile = parser_profile("ocr")
    try:
        reader = PdfReader(BytesIO(payload))
        if reader.is_encrypted:
            return False
        assert_page_count(profile, len(reader.pages))
        return any((page.extract_text() or "").strip() for page in reader.pages)
    except ParserLimitExceeded:
        raise
    except Exception:
        return False


def extract_ocr(
    payload: bytes,
    filename: str,
    text_extractor: OcrTextExtractor | None = None,
    pdf_rasterizer: PdfRasterizer | None = None,
) -> ExtractionResult:
    profile = parser_profile("ocr")
    started_at = start_wall_clock()
    ext = extension(filename)
    extractor = text_extractor or tesseract_text
    try:
        assert_input_bytes(profile, len(payload))
        if ext == "pdf":
            if pdf_has_text_layer(payload):
                return ExtractionResult.failed("ocr", "TEXT_LAYER_PRESENT")
            images = (pdf_rasterizer or rasterize_pdf_pages)(payload)
            if not images:
                return ExtractionResult.failed("ocr", "OCR_NO_PAGES")
            assert_page_count(profile, len(images))
            page_results: list[ExtractionPage] = []
            total_text_chars = 0
            for index, image in enumerate(images):
                page_text = extractor(image, "ppm").strip()
                total_text_chars += len(page_text)
                if total_text_chars > profile.max_output_text_chars:
                    raise ParserLimitExceeded("PARSER_TEXT_LIMIT_EXCEEDED")
                page_results.append(
                    ExtractionPage(
                        page=index + 1,
                        text=page_text,
                        confidence=0.7,
                    )
                )
            pages = tuple(page_results)
            text = "\n\n".join(page.text for page in pages if page.text).strip()
        elif ext in {"png", "jpg", "jpeg"}:
            text = extractor(payload, "png" if ext == "png" else "jpg").strip()
            pages = (ExtractionPage(page=1, text=text, confidence=0.7),)
        else:
            return ExtractionResult.failed("ocr", "UNSUPPORTED_FILE_TYPE")
    except OcrDependencyError:
        return ExtractionResult.failed("ocr", "OCR_DEPENDENCY_UNAVAILABLE")
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("ocr", exc.reason_code)
    except Exception:
        return ExtractionResult.failed("ocr", "OCR_FAILED")

    if not text:
        return ExtractionResult.failed("ocr", "OCR_EMPTY_TEXT")
    try:
        assert_output_text(profile, text)
        assert_wall_time(profile, started_at)
    except ParserLimitExceeded as exc:
        return ExtractionResult.failed("ocr", exc.reason_code)
    return ExtractionResult.ready("ocr", text, confidence=0.7, pages=pages)


def extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    return name.rsplit(".", 1)[-1] if "." in name else ""


def rasterize_pdf_pages(payload: bytes) -> list[bytes]:
    profile = parser_profile("ocr")
    try:
        import pypdfium2 as pdfium
    except Exception as exc:
        raise OcrDependencyError from exc

    document = pdfium.PdfDocument(payload)
    images: list[bytes] = []
    total_bytes = 0
    try:
        assert_page_count(profile, len(document))
        for page in document:
            bitmap = page.render(scale=2)
            image = bitmap_to_ppm(bitmap)
            total_bytes += len(image)
            if total_bytes > profile.max_output_bytes:
                raise ParserLimitExceeded("PARSER_OUTPUT_LIMIT_EXCEEDED")
            images.append(image)
    finally:
        document.close()
    return images


def bitmap_to_ppm(bitmap) -> bytes:
    profile = parser_profile("ocr")
    info = bitmap.get_info()
    expected_bytes = info.width * info.height * info.n_channels
    if expected_bytes < 0 or expected_bytes > profile.max_output_bytes:
        bitmap.close()
        raise ParserLimitExceeded("PARSER_OUTPUT_LIMIT_EXCEEDED")
    raw = bytes(bitmap.buffer)
    pixel_width = info.width * info.n_channels
    header = f"P6\n{info.width} {info.height}\n255\n".encode("ascii")
    rows = []
    for row_index in range(info.height):
        row = raw[row_index * info.stride : row_index * info.stride + pixel_width]
        if info.mode == "BGR":
            row = b"".join(
                bytes((row[offset + 2], row[offset + 1], row[offset]))
                for offset in range(0, len(row), 3)
            )
        elif info.mode != "RGB":
            raise OcrDependencyError(f"unsupported pdfium bitmap mode: {info.mode}")
        rows.append(row)
    bitmap.close()
    return header + b"".join(rows)


def tesseract_text(payload: bytes, image_extension: str) -> str:
    executable = "tesseract"
    with tempfile.TemporaryDirectory() as tmp_dir:
        source = Path(tmp_dir) / f"page.{image_extension}"
        source.write_bytes(payload)
        try:
            result = run_bounded_subprocess(
                [executable, str(source), "stdout", "-l", "kor+eng"],
                profile_name="ocr",
                cwd=tmp_dir,
                check=False,
                timeout_seconds=120,
            )
        except ParserSubprocessFailed as exc:
            raise OcrDependencyError from exc
    if result.returncode != 0:
        raise OcrDependencyError
    return result.stdout.decode("utf-8", errors="ignore")


class OcrDependencyError(RuntimeError):
    pass
