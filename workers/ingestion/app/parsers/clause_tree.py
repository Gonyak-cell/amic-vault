from __future__ import annotations

from dataclasses import dataclass, field
import re


@dataclass
class ClauseTreeNode:
    clause_number: str
    title: str
    body: str
    start_offset: int
    end_offset: int
    level: int
    children: list["ClauseTreeNode"] = field(default_factory=list)


_HEADING_RE = re.compile(
    r"^(?P<heading>\s*제\s*(?P<article>\d+)\s*조[^\n]{0,160}|\s*(?P<decimal>\d+(?:\.\d+)*)\.\s+[^\n]{0,160}|\s*(?P<letter>[가-힣])\.\s+[^\n]{0,160})",
    re.MULTILINE,
)


def extract_clause_tree(text: str) -> list[ClauseTreeNode]:
    matches = list(_HEADING_RE.finditer(text))
    if not matches:
        stripped = text.strip()
        return [
            ClauseTreeNode(
                clause_number="whole-document",
                title="whole-document",
                body=stripped,
                start_offset=0,
                end_offset=len(text),
                level=1,
            )
        ]

    flat: list[ClauseTreeNode] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        heading = match.group("heading").strip()
        number = match.group("article") or match.group("decimal") or match.group("letter") or str(index + 1)
        level = _level(match, str(number))
        body = text[match.end() : end].strip()
        flat.append(
            ClauseTreeNode(
                clause_number=str(number)[:80],
                title=heading[:240],
                body=body,
                start_offset=start,
                end_offset=max(start + 1, end),
                level=level,
            )
        )
    return _nest(flat)


def _level(match: re.Match[str], number: str) -> int:
    if match.group("article") is not None:
        return 1
    if match.group("letter") is not None:
        return 3
    return min(2 + number.count("."), 4)


def _nest(nodes: list[ClauseTreeNode]) -> list[ClauseTreeNode]:
    roots: list[ClauseTreeNode] = []
    stack: list[ClauseTreeNode] = []
    for node in nodes:
        while stack and stack[-1].level >= node.level:
            stack.pop()
        if stack:
            stack[-1].children.append(node)
        else:
            roots.append(node)
        stack.append(node)
    return roots
