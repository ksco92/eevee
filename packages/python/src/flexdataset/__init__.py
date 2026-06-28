"""Python client for the Flexible Dataset Definition (FDD) validator."""

from importlib.metadata import version

from flexdataset.binary import FddBinaryNotFoundError, resolve_binary
from flexdataset.client import FddClient, FddError, er, graph, validate
from flexdataset.models import ValidationResult, Violation

# Derived from the installed package metadata (single source of truth: setup.py)
# so the runtime version can never drift from the published wheel.
__version__ = version("flexdataset")

__all__ = [
    "FddBinaryNotFoundError",
    "FddClient",
    "FddError",
    "ValidationResult",
    "Violation",
    "er",
    "graph",
    "resolve_binary",
    "validate",
]
