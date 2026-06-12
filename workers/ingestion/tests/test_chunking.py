from app.chunking import build_parent_child_chunks


def test_parent_child_chunks_keep_bounds_and_hashes() -> None:
    text = " ".join(f"clause-{index}" for index in range(160))
    chunks = build_parent_child_chunks(text)

    assert chunks[0].chunk_kind == "parent"
    assert chunks[0].parent_ordinal is None
    assert any(chunk.chunk_kind == "child" and chunk.parent_ordinal == 0 for chunk in chunks)
    for chunk in chunks:
        assert chunk.char_end > chunk.char_start
        assert chunk.token_count >= 1
        assert len(chunk.text_hash) == 64
