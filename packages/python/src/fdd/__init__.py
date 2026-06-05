"""Python client for the Flexible Dataset Definition (FDD) validator."""

from fdd.binary import FddBinaryNotFoundError, resolve_binary
from fdd.client import FddClient, FddError, er, graph, validate
from fdd.models import ValidationResult, Violation

__version__ = "0.3.0"

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
