from __future__ import annotations

import subprocess
import tempfile
from collections.abc import Callable
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

from .types import ExtractionPage, ExtractionResult

OcrTextExtractor = Callable[[bytes, str], str]
PdfRasterizer = Callable[[bytes], list[bytes]]


def pdf_has_text_layer(payload: bytes) -> bool:
    try:
        reader = PdfReader(BytesIO(payload))
        if reader.is_encrypted:
            return False
        return any((page.extract_text() or "").strip() for page in reader.pages)
    except Exception:
        return False


def extract_ocr(
    payload: bytes,
    filename: str,
    text_extractor: OcrTextExtractor | None = None,
    pdf_rasterizer: PdfRasterizer | None = None,
) -> ExtractionResult:
    ext = extension(filename)
    extractor = text_extractor or tesseract_text
    try:
        if ext == "pdf":
            if pdf_has_text_layer(payload):
                return ExtractionResult.failed("ocr", "TEXT_LAYER_PRESENT")
            images = (pdf_rasterizer or rasterize_pdf_pages)(payload)
            if not images:
                return ExtractionResult.failed("ocr", "OCR_NO_PAGES")
            pages = tuple(
                ExtractionPage(page=index + 1, text=extractor(image, "ppm").strip(), confidence=0.7)
                for index, image in enumerate(images)
            )
            text = "\n\n".join(page.text for page in pages if page.text).strip()
        elif ext in {"png", "jpg", "jpeg"}:
            text = extractor(payload, "png" if ext == "png" else "jpg").strip()
            pages = (ExtractionPage(page=1, text=text, confidence=0.7),)
        else:
            return ExtractionResult.failed("ocr", "UNSUPPORTED_FILE_TYPE")
    except OcrDependencyError:
        return ExtractionResult.failed("ocr", "OCR_DEPENDENCY_UNAVAILABLE")
    except Exception:
        return ExtractionResult.failed("ocr", "OCR_FAILED")

    if not text:
        return ExtractionResult.failed("ocr", "OCR_EMPTY_TEXT")
    return ExtractionResult.ready("ocr", text, confidence=0.7, pages=pages)


def extension(filename: str) -> str:
    name = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower()
    return name.rsplit(".", 1)[-1] if "." in name else ""


def rasterize_pdf_pages(payload: bytes) -> list[bytes]:
    try:
        import pypdfium2 as pdfium
    except Exception as exc:
        raise OcrDependencyError from exc

    document = pdfium.PdfDocument(payload)
    images: list[bytes] = []
    try:
        for page in document:
            bitmap = page.render(scale=2)
            images.append(bitmap_to_ppm(bitmap))
    finally:
        document.close()
    return images


def bitmap_to_ppm(bitmap) -> bytes:
    info = bitmap.get_info()
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
        result = subprocess.run(
            [executable, str(source), "stdout", "-l", "kor+eng"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
        )
    if result.returncode != 0:
        raise OcrDependencyError(result.stderr.decode("utf-8", errors="ignore"))
    return result.stdout.decode("utf-8", errors="ignore")


class OcrDependencyError(RuntimeError):
    pass
