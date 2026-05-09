"""
tests.__init__ – Test package initializer.

This module prepares the test environment for the micro‑service project that
wraps two external LLM APIs (NVIDIA and Anthropic Claude). It loads environment
variables, configures a project logger, and provides reusable pytest fixtures
for API‑key access.

The fixtures are automatically discovered by pytest, so any test can import
``api_keys`` or ``client`` without additional boilerplate.
"""

from __future__ import annotations

import logging
import os
from typing import Dict

import pytest
from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
# Environment loading
# --------------------------------------------------------------------------- #
# Load variables from a ``.env`` file if present.  ``override=False`` ensures
# that existing environment values (e.g. CI secrets) are not overwritten.
load_dotenv(override=False)

# --------------------------------------------------------------------------- #
# Logging configuration
# --------------------------------------------------------------------------- #
LOGGER = logging.getLogger(__name__)
if not LOGGER.handlers:  # Prevent duplicate handlers when re‑imported
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    LOGGER.addHandler(handler)
    LOGGER.setLevel(logging.INFO)

# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #
def _fetch_api_key(env_var: str) -> str:
    """
    Retrieve a required API key from the environment.

    Args:
        env_var: Name of the environment variable.

    Returns:
        The API key as a string.

    Raises:
        RuntimeError: If the variable is missing or empty.
    """
    value = os.getenv(env_var, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {env_var}")
    LOGGER.debug("Fetched API key for %s", env_var)
    return value


def get_api_keys() -> Dict[str, str]:
    """
    Load both NVIDIA and Claude API keys.

    Returns:
        Mapping with keys ``nvidia`` and ``claude`` containing the respective
        API keys.

    Raises:
        RuntimeError: If any of the required keys are absent.
    """
    keys = {
        "nvidia": _fetch_api_key("NVIDIA_API_KEY"),
        "claude": _fetch_api_key("CLAUDE_API_KEY"),
    }
    LOGGER.info("Successfully loaded API keys for NVIDIA and Claude")
    return keys


# --------------------------------------------------------------------------- #
# Pytest fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="session")
def api_keys() -> Dict[str, str]:
    """
    Session‑wide fixture providing the API keys.

    The fixture loads the keys once per test session, raising an error early
    if the configuration is incomplete.
    """
    LOGGER.info("Providing API keys fixture")
    return get_api_keys()


@pytest.fixture(scope="function")
def reset_logging() -> None:
    """
    Fixture that resets the logger to its default configuration before each
    test function. Useful when tests modify logging levels or handlers.
    """
    for handler in LOGGER.handlers[:]:
        LOGGER.removeHandler(handler)
    LOGGER.handlers.clear()
    LOGGER.handlers.append(logging.StreamHandler())
    LOGGER.setLevel(logging.INFO)
    yield
    # No explicit teardown required – the next test will re‑apply the defaults.


# --------------------------------------------------------------------------- #
# Exported symbols
# --------------------------------------------------------------------------- #
__all__ = ["api_keys", "reset_logging", "get_api_keys", "LOGGER"]