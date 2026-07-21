from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from zipfile import BadZipFile, ZipFile
from xml.etree import ElementTree

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


@dataclass(frozen=True)
class DocxRevision:
    change_type: str
    author: str | None
    date: str | None
    before_text: str
    after_text: str


def _word_attr(element: ElementTree.Element, name: str) -> str | None:
    return element.attrib.get(f"{W_NS}{name}")


def _text(element: ElementTree.Element, tags: set[str]) -> str:
    return "".join(node.text or "" for node in element.iter() if node.tag in tags).strip()


def _parent_map(root: ElementTree.Element) -> dict[ElementTree.Element, ElementTree.Element]:
    return {child: parent for parent in root.iter() for child in parent}


def _run_text_for(element: ElementTree.Element, parents: dict[ElementTree.Element, ElementTree.Element]) -> str:
    current = element
    while current in parents:
        current = parents[current]
        if current.tag == f"{W_NS}r":
            return _text(current, {f"{W_NS}t", f"{W_NS}delText"})
    return ""


def extract_docx_revisions(payload: bytes) -> list[DocxRevision]:
    try:
        with ZipFile(BytesIO(payload)) as archive:
            raw = archive.read("word/document.xml")
    except (BadZipFile, KeyError) as exc:
        raise ValueError("DOCX_REVISION_XML_MISSING") from exc

    try:
        root = ElementTree.fromstring(raw)
    except ElementTree.ParseError as exc:
        raise ValueError("DOCX_REVISION_XML_INVALID") from exc

    parents = _parent_map(root)
    revisions: list[DocxRevision] = []
    for element in root.iter():
        if element.tag == f"{W_NS}ins":
            revisions.append(
                DocxRevision(
                    change_type="insert",
                    author=_word_attr(element, "author"),
                    date=_word_attr(element, "date"),
                    before_text="",
                    after_text=_text(element, {f"{W_NS}t"}),
                ),
            )
        elif element.tag == f"{W_NS}del":
            revisions.append(
                DocxRevision(
                    change_type="delete",
                    author=_word_attr(element, "author"),
                    date=_word_attr(element, "date"),
                    before_text=_text(element, {f"{W_NS}delText", f"{W_NS}t"}),
                    after_text="",
                ),
            )
        elif element.tag == f"{W_NS}moveFrom":
            revisions.append(
                DocxRevision(
                    change_type="move_from",
                    author=_word_attr(element, "author"),
                    date=_word_attr(element, "date"),
                    before_text=_text(element, {f"{W_NS}delText", f"{W_NS}t"}),
                    after_text="",
                ),
            )
        elif element.tag == f"{W_NS}moveTo":
            revisions.append(
                DocxRevision(
                    change_type="move_to",
                    author=_word_attr(element, "author"),
                    date=_word_attr(element, "date"),
                    before_text="",
                    after_text=_text(element, {f"{W_NS}t"}),
                ),
            )
        elif element.tag == f"{W_NS}rPrChange":
            revisions.append(
                DocxRevision(
                    change_type="format",
                    author=_word_attr(element, "author"),
                    date=_word_attr(element, "date"),
                    before_text="",
                    after_text=_run_text_for(element, parents),
                ),
            )
    return revisions
