"""Tests for the package's top-level version export."""

import re
from pathlib import Path

import flexdataset


def test_version_matches_setup() -> None:
    """The runtime __version__ matches the version declared in setup.py."""
    setup_py = Path(__file__).resolve().parents[2] / "setup.py"
    match = re.search(r'version="([^"]+)"', setup_py.read_text())
    assert match is not None
    assert flexdataset.__version__ == match.group(1)
