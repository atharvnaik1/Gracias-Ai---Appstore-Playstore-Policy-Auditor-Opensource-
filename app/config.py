python
"""
app/config.py

Configuration module for the micro‑service.

* Loads environment variables (optionally from a ``.env`` file) via
  ``python‑dotenv``.
* Provides a typed ``Settings`` object based on ``pydantic.BaseSettings``.
* Validates required secrets (NVIDIA and Claude API keys) and numeric
  configuration values.
* Exposes a cached singleton ``get_settings`` helper for the rest of the
  project.
* Configures a module‑level logger for consistent, structured logging.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from pydantic import BaseSettings, Field, ValidationError, validator

# --------------------------------------------------------------------------- #
# Logging configuration – a single logger is shared across the package.
# --------------------------------------------------------------------------- #
_logger_name = "app.config"
logger = logging.getLogger(_logger_name)

if not logger.handlers:  # pragma: no‑cover – guard for interactive sessions.
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

# --------------------------------------------------------------------------- #
# Load a ``.env`` file if present – no‑op when the file does not exist.
# --------------------------------------------------------------------------- #
_env_path = Path(__file__).resolve().parents[1] / ".env"
if _env_path.is_file():
    try:
        load_dotenv(_env_path)
        logger.debug("Loaded environment variables from %s", _env_path)
    except Exception as exc:  # pragma: no‑cover – defensive programming.
        logger.warning("Failed to load .env file %s: %s", _env_path, exc)

# --------------------------------------------------------------------------- #
# Custom exception to make configuration failures explicit.
# --------------------------------------------------------------------------- #
class ConfigError(RuntimeError):
    """Raised when the application configuration cannot be validated."""


# --------------------------------------------------------------------------- #
# Settings model – all configuration values are read from environment variables.
# --------------------------------------------------------------------------- #
class Settings(BaseSettings):
    """
    Typed configuration holder.

    ``pydantic`` reads values from the environment (or the optional ``.env``
    file) and validates them on instantiation.  The model is immutable by
    default – any change must go through ``Settings`` validation.
    """

    # ------------------------------------------------------------------- #
    # Required secrets – both must be present for the service to work.
    # ------------------------------------------------------------------- #
    NVIDIA_API_KEY: str = Field(
        ...,
        description="API key for the NVIDIA LLM endpoint.",
        env="NVIDIA_API_KEY",
    )
    CLAUDE_API_KEY: str = Field(
        ...,
        description="API key for the Anthropic Claude endpoint.",
        env="CLAUDE_API_KEY",
    )

    # ------------------------------------------------------------------- #
    # General service configuration.
    # ------------------------------------------------------------------- #
    DEFAULT_PROVIDER: Literal["nvidia", "claude"] = Field(
        "nvidia",
        description="Provider used when no explicit provider is supplied per request.",
        env="DEFAULT_PROVIDER",
    )
    TIMEOUT: int = Field(
        30,
        description="HTTP request timeout in seconds for external LLM calls.",
        env="TIMEOUT",
    )
    RETRY_COUNT: int = Field(
        3,
        description="Number of automatic retries for transient HTTP errors.",
        env="RETRY_COUNT",
    )
    MAX_CONCURRENT_REQUESTS: int = Field(
        10,
        description="Maximum number of concurrent requests the HTTP client may issue.",
        env="MAX_CONCURRENT_REQUESTS",
    )

    # ------------------------------------------------------------------- #
    # Pydantic configuration.
    # ------------------------------------------------------------------- #
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False
        validate_assignment = True

    # ------------------------------------------------------------------- #
    # Validators.
    # ------------------------------------------------------------------- #
    @validator("TIMEOUT", "RETRY_COUNT", "MAX_CONCURRENT_REQUESTS")
    def _positive_int(cls, v: int, field) -> int:  # noqa: D401
        """Ensure integer‑type settings are strictly positive."""
        if v <= 0:
            raise ValueError(f"{field.name} must be a positive integer")
        return v

    @validator("NVIDIA_API_KEY", "CLAUDE_API_KEY")
    def _non_empty_key(cls, v: str, field) -> str:  # noqa: D401
        """Ensure API keys are non‑empty, whitespace‑stripped strings."""
        stripped = v.strip()
        if not stripped:
            raise ValueError(f"{field.name} cannot be empty")
        return stripped


# --------------------------------------------------------------------------- #
# Cached singleton accessor – cheap, thread‑safe and lazy.
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return a cached ``Settings`` instance.

    The function is deliberately tiny so that it can be imported anywhere
    without worrying about multiple initialisations or hidden side‑effects.
    """
    try:
        settings = Settings()
        logger.debug("Configuration loaded successfully")
        return settings
    except ValidationError as exc:
        logger.error("Configuration validation failed: %s", exc)
        raise ConfigError("Invalid configuration") from exc


# --------------------------------------------------------------------------- #
# Convenience helpers.
# --------------------------------------------------------------------------- #
def as_dict() -> dict[str, Any]:
    """
    Return the current configuration as a plain ``dict`` – useful for
    serialising or passing to libraries that do not understand ``BaseSettings``.
    """
    return get_settings().model_dump()


def reload_settings() -> Settings:
    """
    Force a reload of the configuration, clearing the cache.

    This is handy in long‑running processes when environment variables may
    change at runtime (e.g. during tests).
    """
    get_settings.cache_clear()
    return get_settings()


# --------------------------------------------------------------------------- #
# Exported symbols – keep the public surface explicit.
# --------------------------------------------------------------------------- #
__all__: list[str] = ["Settings", "get_settings", "as_dict", "reload_settings", "logger", "ConfigError"]
