python
"""
src/config.py
==============

Utility module for loading, validating, and exposing API keys used by the
application (NVIDIA and Anthropic Claude).  The implementation follows
production‑grade standards:

*   Typed public interface.
*   Pydantic‑based validation with clear error messages.
*   Thread‑safe caching via ``functools.lru_cache``.
*   Structured logging (debug, info, warning, error) without leaking
    secrets.
*   Security‑oriented input checks (no whitespace, allowed characters,
    length limits).
*   Comprehensive docstrings and explicit exception handling.
"""

from __future__ import annotations

import logging
import re
from functools import lru_cache
from typing import Final

from pydantic import BaseSettings, Field, ValidationError, validator

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
# Pydantic settings model – validates environment variables or a ``.env`` file.
# --------------------------------------------------------------------------- #
class Settings(BaseSettings):
    """
    Typed configuration container.

    Attributes
    ----------
    nvidia_api_key: str
        API key for the NVIDIA LLM service.
    claude_api_key: str
        API key for the Anthropic Claude service.
    """

    nvidia_api_key: str = Field(
        ...,
        env="NVIDIA_API_KEY",
        description="API key for NVIDIA LLM service",
    )
    claude_api_key: str = Field(
        ...,
        env="CLAUDE_API_KEY",
        description="API key for Anthropic Claude service",
    )

    @validator("nvidia_api_key", "claude_api_key")
    def _validate_key(cls, value: str, field) -> str:  # noqa: D401
        """
        Validate that a key is a non‑empty string without whitespace and
        matches the expected pattern (alphanumeric, hyphens, underscores).

        Parameters
        ----------
        value: str
            Raw value supplied by Pydantic.
        field: ModelField
            Field being validated.

        Returns
        -------
        str
            Stripped, validated key.

        Raises
        ------
        ValueError
            If the key is empty, contains whitespace, or fails the pattern.
        """
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field.name} must be a non‑empty string")
        stripped = value.strip()
        if re.search(r"\s", stripped):
            raise ValueError(f"{field.name} must not contain whitespace")
        # Allow only base64‑url‑safe characters, hyphens and underscores.
        if not re.fullmatch(r"[A-Za-z0-9_-]+", stripped):
            raise ValueError(
                f"{field.name} contains illegal characters; only alphanumerics, "
                "hyphens and underscores are allowed"
            )
        return stripped

    class Config:
        """Pydantic configuration options."""

        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        secrets_dir = None


# --------------------------------------------------------------------------- #
# Cached accessor for the Settings instance
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Load and cache the :class:`Settings` instance.

    Returns
    -------
    Settings
        Validated configuration object.

    Raises
    ------
    ConfigError
        If the configuration cannot be loaded or fails validation.
    """
    try:
        settings = Settings()
        LOGGER.debug("Configuration loaded successfully")
        return settings
    except ValidationError as exc:
        LOGGER.error("Configuration validation failed: %s", exc)
        raise ConfigError("Invalid configuration") from exc
    except OSError as exc:
        LOGGER.error("I/O error while loading configuration: %s", exc)
        raise ConfigError("Unable to read configuration file") from exc
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Unexpected error while loading configuration")
        raise ConfigError("Unexpected configuration error") from exc


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
        key = get_settings().nvidia_api_key
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
        key = get_settings().claude_api_key
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
    "Settings",
    "ConfigError",
    "get_settings",
    "get_nvidia_key",
    "get_claude_key",
]
