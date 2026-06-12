from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import re


PARSER_VERSION = "r8-local-v1"


@dataclass(frozen=True)
class ParsedClause:
    clause_kind: str
    clause_number: str
    start_offset: int
    end_offset: int
    heading_hash: str
    text_hash: str


@dataclass(frozen=True)
class ParsedDefinedTerm:
    normalized_term_key: str
    term_hash: str
    definition_hash: str
    start_offset: int
    end_offset: int


@dataclass(frozen=True)
class ParsedRedlineChange:
    change_type: str
    start_offset: int
    end_offset: int
    text_hash: str


@dataclass(frozen=True)
class ContractParseResult:
    status: str
    clauses: list[ParsedClause]
    defined_terms: list[ParsedDefinedTerm]
    redline_changes: list[ParsedRedlineChange]
    warnings: list[str]


_CLAUSE_RE = re.compile(
    r"^(?P<heading>\s*(Article|Section|Clause)\s+(?P<number>[A-Za-z0-9_.-]+)\b[^\n]{0,160}|\s*제\s*(?P<kr_number>\d+)\s*조\b[^\n]{0,160})",
    re.IGNORECASE | re.MULTILINE,
)
_TERM_RE = re.compile(
    r"[\"“](?P<term>[A-Za-z0-9][A-Za-z0-9 _./&()-]{1,78})[\"”]\s+(means|shall mean|has the meaning)\s+(?P<definition>[^.\n]{3,320})",
    re.IGNORECASE | re.MULTILINE,
)
_REDLINE_PATTERNS = [
    ("added", re.compile(r"\[\[ADD:(?P<text>[\s\S]{1,2000}?)\]\]", re.IGNORECASE)),
    ("deleted", re.compile(r"\[\[DEL:(?P<text>[\s\S]{1,2000}?)\]\]", re.IGNORECASE)),
    ("added", re.compile(r"<ins>(?P<text>[\s\S]{1,2000}?)</ins>", re.IGNORECASE)),
    ("deleted", re.compile(r"<del>(?P<text>[\s\S]{1,2000}?)</del>", re.IGNORECASE)),
]


def parse_contract_text(text: str) -> ContractParseResult:
    if not text.strip():
        return ContractParseResult("failed", [], [], [], ["contract.parser:empty_text"])

    clauses = _parse_clauses(text)
    terms = _parse_defined_terms(text)
    redlines, redline_failed = _parse_redlines(text)
    warnings: list[str] = []
    if redline_failed:
        warnings.append("contract.redline:malformed_marker")
    return ContractParseResult(
        status="partial" if redline_failed else "success",
        clauses=clauses,
        defined_terms=terms,
        redline_changes=[] if redline_failed else redlines,
        warnings=warnings,
    )


def _parse_clauses(text: str) -> list[ParsedClause]:
    matches = list(_CLAUSE_RE.finditer(text))
    if not matches:
        return [
            ParsedClause(
                clause_kind="section",
                clause_number="whole-document",
                start_offset=0,
                end_offset=len(text),
                heading_hash=_sha256("whole-document"),
                text_hash=_sha256(text),
            )
        ]

    clauses: list[ParsedClause] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        heading = match.group("heading").strip()
        number = match.group("number") or match.group("kr_number") or str(index + 1)
        clauses.append(
            ParsedClause(
                clause_kind="article"
                if heading.lower().startswith("article") or heading.startswith("제")
                else "section",
                clause_number=number[:80],
                start_offset=start,
                end_offset=max(start + 1, end),
                heading_hash=_sha256(heading),
                text_hash=_sha256(text[start:end]),
            )
        )
    return clauses


def _parse_defined_terms(text: str) -> list[ParsedDefinedTerm]:
    terms: list[ParsedDefinedTerm] = []
    for match in _TERM_RE.finditer(text):
        term = match.group("term").strip()
        definition = match.group("definition").strip()
        terms.append(
            ParsedDefinedTerm(
                normalized_term_key=_normalize_term_key(term),
                term_hash=_sha256(term),
                definition_hash=_sha256(definition),
                start_offset=match.start(),
                end_offset=match.end(),
            )
        )
    return terms


def _parse_redlines(text: str) -> tuple[list[ParsedRedlineChange], bool]:
    malformed = bool(re.search(r"\[\[(ADD|DEL):", text, re.IGNORECASE)) and not bool(
        re.search(r"\[\[(ADD|DEL):[\s\S]{1,2000}?\]\]", text, re.IGNORECASE)
    )
    if malformed:
        return [], True
    changes: list[ParsedRedlineChange] = []
    for change_type, pattern in _REDLINE_PATTERNS:
        for match in pattern.finditer(text):
            changes.append(
                ParsedRedlineChange(
                    change_type=change_type,
                    start_offset=match.start(),
                    end_offset=match.end(),
                    text_hash=_sha256(match.group("text")),
                )
            )
    changes.sort(key=lambda change: change.start_offset)
    return changes, False


def _sha256(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _normalize_term_key(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9 _.-]+", "", value.lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized[:120]
