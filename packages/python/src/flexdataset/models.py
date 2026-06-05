"""Typed results returned by the FDD client."""

from dataclasses import dataclass

from typing_extensions import Self


@dataclass(frozen=True)
class Violation:
    """A single validation finding."""

    level: str
    code: str
    message: str
    schema: str | None = None
    table: str | None = None
    field: str | None = None
    path: str | None = None

    @classmethod
    def from_dict(cls: type[Self], data: dict) -> Self:
        """
        Build a Violation from a CLI JSON object.

        :param data: One violation object from the CLI's JSON output.
        :return: The parsed Violation.
        """
        return cls(
            level=data["level"],
            code=data["code"],
            message=data["message"],
            schema=data.get("schema"),
            table=data.get("table"),
            field=data.get("field"),
            path=data.get("path"),
        )


@dataclass(frozen=True)
class ValidationResult:
    """The aggregate result of validating a dataset root."""

    ok: bool
    violations: list[Violation]

    @classmethod
    def from_dict(cls: type[Self], data: dict) -> Self:
        """
        Build a ValidationResult from the CLI's JSON output.

        :param data: The CLI's top-level JSON object.
        :return: The parsed ValidationResult.
        """
        return cls(
            ok=data["ok"],
            violations=[Violation.from_dict(item) for item in data["violations"]],
        )

    @property
    def errors(self: Self) -> list[Violation]:
        """Return only the error-level violations."""
        return [
            violation for violation in self.violations if violation.level == "error"
        ]

    @property
    def warnings(self: Self) -> list[Violation]:
        """Return only the warning-level violations."""
        return [
            violation for violation in self.violations if violation.level == "warning"
        ]
