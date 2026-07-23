from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
from zipfile import ZipInfo

import pytest

from app.resource_policy import (
    ParserLimitExceeded,
    ParserSubprocessFailed,
    assert_fallback_count,
    assert_input_bytes,
    assert_output_bytes,
    assert_output_text,
    assert_page_count,
    assert_wall_time,
    parser_profile,
    policy_manifest,
    run_bounded_subprocess,
    validate_archive_members,
)


def _member(
    name: str,
    *,
    size: int = 1,
    compressed: int = 1,
    encrypted: bool = False,
) -> ZipInfo:
    info = ZipInfo(name)
    info.file_size = size
    info.compress_size = compressed
    info.flag_bits = 0x1 if encrypted else 0
    return info


def _reason(call) -> str:
    with pytest.raises(ParserLimitExceeded) as caught:
        call()
    return caught.value.reason_code


def test_manifest_is_closed_and_deterministic() -> None:
    first = json.dumps(policy_manifest(), sort_keys=True)
    second = json.dumps(policy_manifest(), sort_keys=True)
    assert first == second
    assert set(policy_manifest()) == {"extract", "ocr", "convert", "email", "zip"}
    assert _reason(lambda: parser_profile("unknown")) == "PARSER_PROFILE_INVALID"


def test_scalar_limits_accept_boundary_and_reject_one_over(monkeypatch: pytest.MonkeyPatch) -> None:
    profile = parser_profile("extract")
    assert_input_bytes(profile, profile.max_input_bytes)
    assert_output_text(profile, "x" * profile.max_output_text_chars)
    assert_output_bytes(profile, b"x" * profile.max_output_bytes)
    assert_page_count(profile, profile.max_pages)
    assert_fallback_count(profile, profile.max_fallbacks)
    assert _reason(lambda: assert_input_bytes(profile, profile.max_input_bytes + 1)) == (
        "PARSER_INPUT_LIMIT_EXCEEDED"
    )
    assert _reason(lambda: assert_output_text(profile, "x" * (profile.max_output_text_chars + 1))) == (
        "PARSER_TEXT_LIMIT_EXCEEDED"
    )
    assert _reason(lambda: assert_output_bytes(profile, b"x" * (profile.max_output_bytes + 1))) == (
        "PARSER_OUTPUT_LIMIT_EXCEEDED"
    )
    assert _reason(lambda: assert_page_count(profile, profile.max_pages + 1)) == (
        "PARSER_PAGE_LIMIT_EXCEEDED"
    )
    assert _reason(lambda: assert_fallback_count(profile, profile.max_fallbacks + 1)) == (
        "PARSER_FALLBACK_LIMIT_EXCEEDED"
    )
    moments = iter((100.0 + profile.wall_seconds + 0.001,))
    monkeypatch.setattr("app.resource_policy.time.monotonic", lambda: next(moments))
    started = 100.0
    assert _reason(lambda: assert_wall_time(profile, started)) == "PARSER_WALL_TIME_EXCEEDED"


def test_archive_limits_cover_traversal_duplicates_depth_encryption_ratio_and_expansion() -> None:
    profile = parser_profile("zip")
    accepted = validate_archive_members(
        profile,
        [_member("contracts/one.pdf"), _member("notes/two.txt")],
    )
    assert [path for _, path in accepted] == ["contracts/one.pdf", "notes/two.txt"]
    cases = [
        ([_member("../escape")], "ZIP_PATH_TRAVERSAL"),
        ([_member("A.txt"), _member("a.TXT")], "ZIP_DUPLICATE_PATH"),
        ([_member("/".join(["d"] * (profile.max_archive_depth + 1)))], "ZIP_DEPTH_EXCEEDED"),
        ([_member("secret", encrypted=True)], "ZIP_ENCRYPTED_ENTRY"),
        ([_member("bomb", size=101, compressed=1)], "ZIP_COMPRESSION_RATIO_EXCEEDED"),
        (
            [_member("huge", size=profile.max_expanded_bytes + 1, compressed=profile.max_expanded_bytes)],
            "ZIP_UNCOMPRESSED_SIZE_EXCEEDED",
        ),
    ]
    for members, reason in cases:
        assert _reason(lambda members=members: validate_archive_members(profile, members)) == reason


def test_subprocess_success_failure_timeout_and_bounded_output(tmp_path: Path) -> None:
    success = run_bounded_subprocess(
        [sys.executable, "-c", "print('ok')"],
        profile_name="extract",
        check=True,
    )
    assert success.stdout == b"ok\n"

    with pytest.raises(ParserSubprocessFailed) as failed:
        run_bounded_subprocess(
            [sys.executable, "-c", "raise SystemExit(3)"],
            profile_name="extract",
            check=True,
        )
    assert failed.value.reason_code == "PARSER_SUBPROCESS_FAILED"
    assert failed.value.returncode == 3

    marker = tmp_path / "child-alive"
    script = (
        "import subprocess,sys,time;"
        f"subprocess.Popen([sys.executable,'-c',\"import time,pathlib;"
        f"time.sleep(2);pathlib.Path(r'{marker}').write_text('alive')\"]);"
        "time.sleep(20)"
    )
    with pytest.raises(ParserSubprocessFailed) as timed_out:
        run_bounded_subprocess(
            [sys.executable, "-c", script],
            profile_name="extract",
            timeout_seconds=1,
        )
    assert timed_out.value.reason_code == "PARSER_SUBPROCESS_TIMEOUT"
    assert not marker.exists()

    output_limit = parser_profile("extract").max_subprocess_output_bytes
    with pytest.raises(ParserSubprocessFailed) as oversized:
        run_bounded_subprocess(
            [sys.executable, "-c", f"import os;os.write(1,b'x'*{output_limit + 1})"],
            profile_name="extract",
        )
    assert oversized.value.reason_code == "PARSER_SUBPROCESS_OUTPUT_LIMIT_EXCEEDED"


def test_subprocess_cancellation_terminates_the_process_group(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    started = tmp_path / "parent-started"
    child_marker = tmp_path / "child-survived"
    script = (
        "import pathlib,subprocess,sys,time;"
        f"subprocess.Popen([sys.executable,'-c',\"import pathlib,time;"
        f"time.sleep(2);pathlib.Path(r'{child_marker}').write_text('alive')\"]);"
        f"pathlib.Path(r'{started}').write_text('started');"
        "time.sleep(20)"
    )
    import time as time_module

    real_sleep = time_module.sleep

    class SyntheticCancellation(BaseException):
        pass

    def cancel_after_child_started(_seconds: float) -> None:
        deadline = time_module.monotonic() + 2
        while not started.exists() and time_module.monotonic() < deadline:
            real_sleep(0.01)
        raise SyntheticCancellation

    monkeypatch.setattr("app.resource_policy.time.sleep", cancel_after_child_started)
    with pytest.raises(SyntheticCancellation):
        run_bounded_subprocess(
            [sys.executable, "-c", script],
            profile_name="extract",
        )
    real_sleep(2.2)
    assert started.exists()
    assert not child_marker.exists()


def test_subprocess_contract_rejects_invalid_command_and_does_not_echo_secret() -> None:
    canary = "customer-body-canary"
    with pytest.raises(ParserSubprocessFailed) as caught:
        run_bounded_subprocess([], profile_name="extract")
    assert caught.value.reason_code == "PARSER_SUBPROCESS_COMMAND_INVALID"
    assert canary not in str(caught.value)
    assert caught.value.__cause__ is None
