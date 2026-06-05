"""Tests for flexdataset binary resolution."""

import sys
from pathlib import Path
from unittest.mock import patch

import pytest

from flexdataset.binary import FddBinaryNotFoundError, _bundled_binary, resolve_binary


def test_bundled_binary_points_inside_package() -> None:
    """Test that the bundled-binary path lives in the package _bin directory."""
    path = _bundled_binary()

    assert path.parent.name == "_bin"
    assert path.name in ("flexdataset", "flexdataset.exe")


def test_resolve_binary_uses_env_override() -> None:
    """Test that FDD_BINARY is split with shell rules."""
    with patch.dict("os.environ", {"FDD_BINARY": "node /path/to/cli.js"}, clear=True):
        assert resolve_binary() == ["node", "/path/to/cli.js"]


def test_resolve_binary_preserves_windows_paths() -> None:
    """Test that a Windows FDD_BINARY keeps its backslashes."""
    win_path = "C:\\Users\\me\\flexdataset.exe"
    with (
        patch.dict("os.environ", {"FDD_BINARY": win_path}, clear=True),
        patch.object(sys, "platform", "win32"),
    ):
        assert resolve_binary() == [win_path]


def test_resolve_binary_uses_bundled_binary() -> None:
    """Test that a bundled binary is used when present and no override is set."""
    with (
        patch.dict("os.environ", {}, clear=True),
        patch("flexdataset.binary._bundled_binary", return_value=Path(__file__)),
    ):
        assert resolve_binary() == [str(Path(__file__))]


def test_resolve_binary_raises_when_missing() -> None:
    """Test that a missing binary raises FddBinaryNotFoundError."""
    with (
        patch.dict("os.environ", {}, clear=True),
        patch(
            "flexdataset.binary._bundled_binary",
            return_value=Path("/no/such/flexdataset"),
        ),
    ):
        with pytest.raises(
            FddBinaryNotFoundError, match="flexdataset binary not found"
        ):
            resolve_binary()
