python
"""
src/config.py
==============

Utility module for loading, validating, and exposing API keys used by the
application (NVIDIA and Anthropic Claude).  The implementation follows
production‑grade standards:

*   Typed public interface.
*   Simple environment‑variable loading (os.getenv) with sensible defaults.
*   Thread‑safe caching via ``functools.lru_cache``.
*   Structured logging (debug, info, warning, error) without leaking
    secrets.
*   Security‑oriented input checks (no whitespace, allowed characters,
    length limits).
*   Comprehensive docstrings and explicit exception handling.
"""

from __future__ import annotations

import os
import logging
import re
from functools import lru_cache
from typing import Final

# --------------------------------------------------------------------------- #
# Logging – configure a handler only if the logger has none to avoid duplicate
# messages when the host application configures logging globally.
# --------------------------------------------------------------------------- #
LOGGER: Final = logging.getLogger(__name__)
if not LOGGER.handlers:
    _handler = logging.StreamHandler()
    _formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _handler.setFormatter(_formatter)
    LOGGER.addHandler(_handler)
    LOGGER.setLevel(logging.INFO)

# --------------------------------------------------------------------------- #
# Public exception hierarchy
# --------------------------------------------------------------------------- #
class ConfigError(RuntimeError):
    """Raised when configuration cannot be loaded or fails validation."""


# --------------------------------------------------------------------------- #
# Helper – mask API keys for safe logging
# --------------------------------------------------------------------------- #
def _mask_key(key: str) -> str:
    """
    Return a masked representation of an API key, exposing only the last four
    characters.

    Parameters
    ----------
    key: str
        Original API key.

    Returns
    -------
    str
        Masked key (e.g. ``****abcd``).
    """
    if len(key) <= 4:
        return "*" * len(key)
    return f"{'*' * (len(key) - 4)}{key[-4:]}"


# --------------------------------------------------------------------------- #
# Validation utilities
# --------------------------------------------------------------------------- #
def _validate_key(value: str | None, name: str) -> str:
    """
    Validate that a key is a non‑empty string without whitespace and
    matches the expected pattern (alphanumeric, hyphens, underscores).

    Parameters
    ----------
    value: str | None
        Raw value supplied from the environment.
    name: str
        Human‑readable name of the variable for error messages.

    Returns
    -------
    str
        Stripped, validated key.

    Raises
    ------
    ConfigError
        If the key is missing, empty, contains whitespace, or fails the pattern.
    """
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{name} must be a non‑empty string")
    stripped = value.strip()
    if re.search(r"\s", stripped):
        raise ConfigError(f"{name} must not contain whitespace")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", stripped):
        raise ConfigError(
            f"{name} contains illegal characters; only alphanumerics, "
            "hyphens and underscores are allowed"
        )
    return stripped


# --------------------------------------------------------------------------- #
# Cached accessor for the configuration
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def _load_config() -> dict[str, str]:
    """
    Load configuration from environment variables, validate, and cache it.

    Returns
    -------
    dict[str, str]
        Mapping with keys ``nvidia_api_key`` and ``claude_api_key``.

    Raises
    ------
    ConfigError
        If any required variable is missing or invalid.
    """
    try:
        nvidia_raw = os.getenv("NVIDIA_API_KEY")
        claude_raw = os.getenv("CLAUDE_API_KEY")

        nvidia_key = _validate_key(nvidia_raw, "NVIDIA_API_KEY")
        claude_key = _validate_key(claude_raw, "CLAUDE_API_KEY")

        LOGGER.debug(
            "Configuration loaded: NVIDIA=%s, Claude=%s",
            _mask_key(nvidia_key),
            _mask_key(claude_key),
        )
        return {"nvidia_api_key": nvidia_key, "claude_api_key": claude_key}
    except ConfigError as exc:
        LOGGER.error("Configuration validation failed: %s", exc)
        raise
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Unexpected error while loading configuration")
        raise ConfigError("Unexpected configuration error") from exc


# --------------------------------------------------------------------------- #
# Public getters – cached for performance, never log the full key
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_nvidia_key() -> str:
    """
    Retrieve the validated NVIDIA API key.

    Returns
    -------
    str
        NVIDIA API key.

    Raises
    ------
    ConfigError
        If the key cannot be obtained.
    """
    try:
        key = _load_config()["nvidia_api_key"]
        LOGGER.debug("NVIDIA API key accessed: %s", _mask_key(key))
        return key
    except ConfigError:
        LOGGER.exception("Failed to obtain NVIDIA API key")
        raise
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Unexpected error while obtaining NVIDIA API key")
        raise ConfigError("NVIDIA API key is not configured") from exc


@lru_cache(maxsize=1)
def get_claude_key() -> str:
    """
    Retrieve the validated Anthropic Claude API key.

    Returns
    -------
    str
        Claude API key.

    Raises
    ------
    ConfigError
        If the key cannot be obtained.
    """
    try:
        key = _load_config()["claude_api_key"]
        LOGGER.debug("Claude API key accessed: %s", _mask_key(key))
        return key
    except ConfigError:
        LOGGER.exception("Failed to obtain Claude API key")
        raise
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Unexpected error while obtaining Claude API key")
        raise ConfigError("Claude API key is not configured") from exc


# --------------------------------------------------------------------------- #
# Public API of the module
# --------------------------------------------------------------------------- #
__all__: list[str] = [
    "ConfigError",
    "get_nvidia_key",
    "get_claude_key",
]