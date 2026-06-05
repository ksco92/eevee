"""Locate the flexdataset command-line binary."""

import os
import shlex
import sys
from pathlib import Path


class FddBinaryNotFoundError(RuntimeError):
    """Raised when the flexdataset binary cannot be located."""


def _bundled_binary() -> Path:
    """
    Return the path where a platform wheel bundles the binary.

    :return: The expected path of the bundled binary inside this package.
    """
    name = "flexdataset.exe" if sys.platform.startswith("win") else "flexdataset"
    return Path(__file__).resolve().parent / "_bin" / name


def resolve_binary() -> list[str]:
    """
    Resolve the command used to invoke the flexdataset CLI.

    Resolution order: the ``FDD_BINARY`` environment variable (split with shell
    rules, so ``"node /path/to/cli.js"`` works), then a binary bundled in the
    installed platform wheel. On Windows the variable is split in non-POSIX mode
    so backslashes in paths are preserved.

    :raises FddBinaryNotFoundError: When no binary can be located.
    :return: The command and arguments used to launch the CLI.
    """
    override = os.environ.get("FDD_BINARY")
    if override:
        return shlex.split(override, posix=not sys.platform.startswith("win"))

    bundled = _bundled_binary()
    if bundled.exists():
        return [str(bundled)]

    raise FddBinaryNotFoundError(
        "flexdataset binary not found. Install a platform wheel that bundles it, or set "
        "FDD_BINARY to the CLI path (for example 'node /path/to/dist/src/cli.js').",
    )
