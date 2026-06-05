"""Tests for the FDD client."""

import subprocess
from unittest.mock import patch

import pytest

from flexdataset.client import FddClient, FddError, er, graph, validate


def _completed(
    stdout: str = "", stderr: str = "", returncode: int = 0
) -> "subprocess.CompletedProcess[str]":
    """
    Build a fake CompletedProcess for mocking subprocess.run.

    :param stdout: Standard output text.
    :param stderr: Standard error text.
    :param returncode: Process exit code.
    :return: A CompletedProcess with the given fields.
    """
    return subprocess.CompletedProcess(
        args=[], returncode=returncode, stdout=stdout, stderr=stderr
    )


def test_client_uses_explicit_command() -> None:
    """Test that an explicit command overrides resolution."""
    client = FddClient(command=["flexdataset-bin"])

    assert client.command == ["flexdataset-bin"]


def test_client_resolves_default_command() -> None:
    """Test that the default command comes from resolve_binary."""
    with patch("flexdataset.client.resolve_binary", return_value=["resolved"]):
        assert FddClient().command == ["resolved"]


def test_validate_parses_json() -> None:
    """Test that validate parses the CLI JSON into a ValidationResult."""
    payload = (
        '{"ok": false, "violations": [{"level": "error", "code": "E", "message": "m"}]}'
    )

    with patch(
        "flexdataset.client.subprocess.run",
        return_value=_completed(stdout=payload, returncode=1),
    ) as mock_run:
        result = FddClient(command=["flexdataset"]).validate("root")

    assert result.ok is False
    assert result.errors[0].code == "E"
    mock_run.assert_called_once_with(
        ["flexdataset", "validate", "root", "--format", "json"],
        capture_output=True,
        text=True,
        check=False,
    )


def test_validate_raises_on_non_json_with_stderr() -> None:
    """Test that non-JSON output raises FddError carrying the stderr message."""
    with patch(
        "flexdataset.client.subprocess.run",
        return_value=_completed(stdout="oops", stderr="bad root", returncode=1),
    ):
        with pytest.raises(FddError, match="bad root"):
            FddClient(command=["flexdataset"]).validate("root")


def test_validate_raises_on_non_json_without_stderr() -> None:
    """Test that an empty stderr falls back to the JSON decode error."""
    with patch(
        "flexdataset.client.subprocess.run",
        return_value=_completed(stdout="", stderr="", returncode=1),
    ):
        with pytest.raises(FddError):
            FddClient(command=["flexdataset"]).validate("root")


def test_graph_returns_svg() -> None:
    """Test that graph returns the CLI stdout on success."""
    with patch(
        "flexdataset.client.subprocess.run",
        return_value=_completed(stdout="<svg/>", returncode=0),
    ):
        assert FddClient(command=["flexdataset"]).graph("root") == "<svg/>"


def test_er_returns_svg() -> None:
    """Test that er returns the CLI stdout on success."""
    with patch(
        "flexdataset.client.subprocess.run",
        return_value=_completed(stdout="<svg/>", returncode=0),
    ):
        assert FddClient(command=["flexdataset"]).er("root") == "<svg/>"


def test_render_raises_with_stderr() -> None:
    """Test that a failing diagram command raises FddError with the stderr message."""
    with patch(
        "flexdataset.client.subprocess.run",
        return_value=_completed(stderr="boom", returncode=1),
    ):
        with pytest.raises(FddError, match="boom"):
            FddClient(command=["flexdataset"]).graph("root")


def test_render_raises_without_stderr() -> None:
    """Test the fallback message when a diagram command fails with no stderr."""
    with patch(
        "flexdataset.client.subprocess.run", return_value=_completed(returncode=1)
    ):
        with pytest.raises(FddError, match="flexdataset er failed"):
            FddClient(command=["flexdataset"]).er("root")


def test_module_level_helpers() -> None:
    """Test the module-level validate, graph, and er convenience functions."""
    with patch("flexdataset.client.FddClient") as mock_client_cls:
        instance = mock_client_cls.return_value
        instance.validate.return_value = "v"
        instance.graph.return_value = "g"
        instance.er.return_value = "e"

        assert validate("r") == "v"
        assert graph("r") == "g"
        assert er("r") == "e"
