"""Python client for the Flexible Dataset Definition (FDD) validator."""

from flexdataset.binary import FddBinaryNotFoundError, resolve_binary
from flexdataset.client import FddClient, FddError, er, graph, validate
from flexdataset.models import ValidationResult, Violation

__version__ = "0.21.1"

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
