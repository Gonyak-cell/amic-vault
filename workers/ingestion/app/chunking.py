from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256

PARENT_MAX_CHARS = 3200
CHILD_MAX_CHARS = 900
CHILD_OVERLAP_CHARS = 120
MAX_CHUNKS_PER_VERSION = 256


@dataclass(frozen=True)
class ExtractedChunk:
    chunk_kind: str
    chunk_ordinal: int
    parent_ordinal: int | None
    char_start: int
    char_end: int
    token_count: int
    text_hash: str


def _bounded_end(text: str, start: int, target_end: int) -> int:
    capped = min(len(text), target_end)
    if capped >= len(text):
        return len(text)
    next_space = text.find(" ", capped)
    if next_space > start and next_space - start <= target_end - start + 80:
        return next_space
    return capped


def _token_count(text: str) -> int:
    return max(1, len([token for token in text.strip().split() if token]))


def _push_chunk(
    chunks: list[ExtractedChunk],
    *,
    kind: str,
    parent_ordinal: int | None,
    text: str,
    start: int,
    end: int,
) -> int:
    chunk_text = text[start:end].strip()
    if not chunk_text:
        return -1
    ordinal = len(chunks)
    chunks.append(
        ExtractedChunk(
            chunk_kind=kind,
            chunk_ordinal=ordinal,
            parent_ordinal=parent_ordinal,
            char_start=start,
            char_end=end,
            token_count=_token_count(chunk_text),
            text_hash=sha256(chunk_text.encode("utf-8")).hexdigest(),
        )
    )
    return ordinal


def build_parent_child_chunks(text: str) -> list[ExtractedChunk]:
    if not text.strip():
        return []

    chunks: list[ExtractedChunk] = []
    parent_start = 0
    while parent_start < len(text) and len(chunks) < MAX_CHUNKS_PER_VERSION:
        parent_end = _bounded_end(text, parent_start, parent_start + PARENT_MAX_CHARS)
        parent_ordinal = _push_chunk(
            chunks,
            kind="parent",
            parent_ordinal=None,
            text=text,
            start=parent_start,
            end=parent_end,
        )
        if parent_ordinal >= 0:
            child_start = parent_start
            while child_start < parent_end and len(chunks) < MAX_CHUNKS_PER_VERSION:
                child_end = _bounded_end(text, child_start, child_start + CHILD_MAX_CHARS)
                _push_chunk(
                    chunks,
                    kind="child",
                    parent_ordinal=parent_ordinal,
                    text=text,
                    start=child_start,
                    end=child_end,
                )
                if child_end >= parent_end:
                    break
                child_start = max(child_start + 1, child_end - CHILD_OVERLAP_CHARS)
        if parent_end >= len(text):
            break
        parent_start = parent_end

    return chunks
