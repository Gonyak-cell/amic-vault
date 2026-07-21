from app.parsers.clause_tree import extract_clause_tree


def test_clause_tree_extracts_korean_contract_articles_and_boundaries() -> None:
    text = "\n\n".join(
        [
            f"제{index}조 조항 {index}\n본문 {index}\n1. 세부 {index}\n세부 본문 {index}\n가. 하위 {index}\n하위 본문 {index}"
            for index in range(1, 11)
        ]
    )

    tree = extract_clause_tree(text)

    assert [node.clause_number for node in tree] == [str(index) for index in range(1, 11)]
    assert tree[0].title == "제1조 조항 1"
    assert tree[0].body == "본문 1"
    assert tree[0].children[0].clause_number == "1"
    assert tree[0].children[0].body == "세부 본문 1"
    assert tree[0].children[0].children[0].clause_number == "가"
    assert tree[0].children[0].children[0].body == "하위 본문 1"
    assert tree[-1].title == "제10조 조항 10"
    assert tree[0].start_offset == 0
    assert tree[0].end_offset < tree[1].start_offset
