"""Client for invoking the flexdataset CLI and parsing its output."""

import json
import subprocess
from pathlib import Path

from typing_extensions import Self

from flexdataset.binary import resolve_binary
from flexdataset.models import ValidationResult


class FddError(RuntimeError):
    """Raised when the flexdataset CLI fails in a way that yields no parseable output."""


class FddClient:
    """Client for the flexdataset command-line tool."""

    def __init__(self: Self, command: list[str] | None = None) -> None:
        """
        Create the client.

        :param command: Override for the CLI command. Defaults to the resolved binary.
        """
        self.command = command if command is not None else resolve_binary()

    def validate(self: Self, root: str | Path) -> ValidationResult:
        """
        Validate a dataset root.

        :param root: Path to the dataset root.
        :raises FddError: When the CLI produces no parseable JSON (for example a bad root).
        :return: The parsed validation result.
        """
        completed = self._run(["validate", str(root), "--format", "json"])
        try:
            data = json.loads(completed.stdout)
        except json.JSONDecodeError as error:
            raise FddError(completed.stderr.strip() or str(error)) from error
        return ValidationResult.from_dict(data)

    def graph(self: Self, root: str | Path) -> str:
        """
        Render the dependency DAG as SVG.

        :param root: Path to the dataset root.
        :raises FddError: When the CLI fails to render.
        :return: The SVG markup.
        """
        return self._render(["graph", str(root)])

    def er(self: Self, root: str | Path, keys_only: bool = False) -> str:
        """
        Render the entity-relationship diagram as SVG.

        :param root: Path to the dataset root.
        :param keys_only: Show only primary-key and foreign-key columns.
        :raises FddError: When the CLI fails to render.
        :return: The SVG markup.
        """
        args = ["er", str(root)]
        if keys_only:
            args.append("--keys-only")
        return self._render(args)

    def _render(self: Self, args: list[str]) -> str:
        """
        Run a diagram command and return its SVG output.

        :param args: The diagram command and its arguments.
        :raises FddError: When the CLI exits non-zero.
        :return: The SVG markup.
        """
        completed = self._run(args)
        if completed.returncode != 0:
            raise FddError(completed.stderr.strip() or f"flexdataset {args[0]} failed")
        return completed.stdout

    def _run(self: Self, args: list[str]) -> "subprocess.CompletedProcess[str]":
        """
        Run the CLI with the given arguments.

        :param args: CLI arguments.
        :return: The completed process.
        """
        return subprocess.run(
            self.command + args,
            capture_output=True,
            text=True,
            check=False,
        )


def validate(root: str | Path) -> ValidationResult:
    """
    Validate a dataset root using the default binary.

    :param root: Path to the dataset root.
    :return: The parsed validation result.
    """
    return FddClient().validate(root)


def graph(root: str | Path) -> str:
    """
    Render the dependency DAG as SVG using the default binary.

    :param root: Path to the dataset root.
    :return: The SVG markup.
    """
    return FddClient().graph(root)


def er(root: str | Path, keys_only: bool = False) -> str:
    """
    Render the entity-relationship diagram as SVG using the default binary.

    :param root: Path to the dataset root.
    :param keys_only: Show only primary-key and foreign-key columns.
    :return: The SVG markup.
    """
    return FddClient().er(root, keys_only=keys_only)
