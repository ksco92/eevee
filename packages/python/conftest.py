"""Block real network calls during the test session."""

from pytest_socket import disable_socket


def pytest_runtest_setup() -> None:
    """Disable real sockets before every test runs."""
    disable_socket()
