from app.parsers.contract import parse_contract_text


def test_contract_parser_extracts_clauses_terms_and_redlines() -> None:
    text = """Article 1 Definitions
"Confidential Information" means information disclosed by either party

Section 2 Obligations
The receiving party shall protect the information. [[ADD:New safeguard]]
"""
    parsed = parse_contract_text(text)

    assert parsed.status == "success"
    assert [clause.clause_number for clause in parsed.clauses] == ["1", "2"]
    assert parsed.defined_terms[0].normalized_term_key == "confidential information"
    assert parsed.redline_changes[0].change_type == "added"
    assert "New safeguard" not in parsed.redline_changes[0].text_hash


def test_contract_parser_preserves_original_on_malformed_redline() -> None:
    text = "Article 1 Broken\n[[ADD:missing terminator"
    parsed = parse_contract_text(text)

    assert parsed.status == "partial"
    assert parsed.redline_changes == []
    assert parsed.warnings == ["contract.redline:malformed_marker"]
