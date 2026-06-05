"""Tests for the FDD result models."""

from fdd.models import ValidationResult, Violation


def test_violation_from_dict_full() -> None:
    """Test that Violation.from_dict reads every field."""
    data = {
        "level": "error",
        "code": "PK_COLUMNS_EXIST",
        "message": "boom",
        "schema": "raw",
        "table": "t",
        "field": "primaryKey",
        "path": "/x",
    }

    violation = Violation.from_dict(data)

    assert violation.level == "error"
    assert violation.code == "PK_COLUMNS_EXIST"
    assert violation.schema == "raw"
    assert violation.table == "t"
    assert violation.field == "primaryKey"
    assert violation.path == "/x"


def test_violation_from_dict_minimal() -> None:
    """Test that optional Violation fields default to None."""
    violation = Violation.from_dict(
        {
            "level": "warning",
            "code": "FK_SOURCE_IS_KEY",
            "message": "warn",
        },
    )

    assert violation.schema is None
    assert violation.table is None
    assert violation.field is None
    assert violation.path is None


def test_validation_result_partitions_errors_and_warnings() -> None:
    """Test ValidationResult parsing plus the errors and warnings properties."""
    data = {
        "ok": False,
        "violations": [
            {
                "level": "error",
                "code": "E",
                "message": "e",
            },
            {
                "level": "warning",
                "code": "W",
                "message": "w",
            },
        ],
    }

    result = ValidationResult.from_dict(data)

    assert result.ok is False
    assert len(result.violations) == 2
    assert [violation.code for violation in result.errors] == ["E"]
    assert [violation.code for violation in result.warnings] == ["W"]
