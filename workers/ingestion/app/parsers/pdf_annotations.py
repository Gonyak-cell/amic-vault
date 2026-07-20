from __future__ import annotations

from dataclasses import dataclass

import pymupdf


@dataclass(frozen=True)
class PdfAnnotation:
    annotation_type: str
    page: int
    author: str | None
    contents: str
    rect: tuple[float, ...]


def _annotation_type(annotation: pymupdf.Annot) -> str:
    name = str(annotation.type[1] if len(annotation.type) > 1 else annotation.type[0])
    return name.lower().replace(" ", "")


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value)
    return text if text else None


def _rect(annotation: pymupdf.Annot) -> tuple[float, ...]:
    rect = annotation.rect
    if rect is None:
        return ()
    return (float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1))


def extract_pdf_annotations(payload: bytes) -> list[PdfAnnotation]:
    try:
        document = pymupdf.open(stream=payload, filetype="pdf")
    except Exception as exc:
        raise ValueError("PDF_ANNOTATION_PARSE_FAILED") from exc

    try:
        if document.needs_pass:
            raise ValueError("ENCRYPTED_PDF")

        annotations: list[PdfAnnotation] = []
        for page_index, page in enumerate(document, start=1):
            for annotation in page.annots() or ():
                info = annotation.info or {}
                annotations.append(
                    PdfAnnotation(
                        annotation_type=_annotation_type(annotation),
                        page=page_index,
                        author=_text(info.get("title")),
                        contents=_text(info.get("content")) or "",
                        rect=_rect(annotation),
                    ),
                )
        return annotations
    finally:
        document.close()
