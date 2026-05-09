"""
app/config.py

Configuration module for the micro‑service.

- Loads environment variables (including a optional ``.env`` file) via
  ``python‑dotenv``.
- Provides a typed ``Settings`` object based on ``pydantic.BaseSettings``.
- Validates the presence of required secrets (NVIDIA and Claude API keys).
- Exposes a singleton ``get_settings`` helper for the rest of the project.
- Configures a module‑level logger for consistent logging.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseSettings, Field, ValidationError, validator

# --------------------------------------------------------------------------- #
# Load ``.env`` if it exists – this is a no‑op when the file is absent.
# --------------------------------------------------------------------------- #
dotenv_path = Path(__file__).resolve().parents[1] / ".env"
if dotenv_path.is_file():
    load_dotenv(dotenv_path)

# --------------------------------------------------------------------------- #
# Logger configuration – the same logger name is used throughout the package.
# --------------------------------------------------------------------------- #
logger = logging.getLogger("app.config")
if not logger.handlers:
    # Prevent duplicate handlers in interactive sessions.
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

# --------------------------------------------------------------------------- #
# Settings model – all configuration values are read from environment variables.
# --------------------------------------------------------------------------- #
class Settings(BaseSettings):
    """
    Typed configuration holder.

    The values are read from environment variables (or a ``.env`` file) on
    first import.  ``pydantic`` performs type conversion and validation.
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
    def _positive_int(cls, v: int, field):  # noqa: D401
        """Ensure integer‑type settings are positive."""
        if v <= 0:
            raise ValueError(f"{field.name} must be a positive integer")
        return v

    @validator("NVIDIA_API_KEY", "CLAUDE_API_KEY")
    def _non_empty_key(cls, v: str, field):  # noqa: D401
        """Ensure API keys are not empty strings."""
        if not v.strip():
            raise ValueError(f"{field.name} cannot be empty")
        return v.strip()


# --------------------------------------------------------------------------- #
# Cached singleton accessor – cheap and thread‑safe.
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
        raise


# --------------------------------------------------------------------------- #
# Convenience constants for external modules that prefer a plain dict.
# --------------------------------------------------------------------------- #
def as_dict() -> dict:
    """
    Return the current configuration as a plain ``dict`` – useful for
    serialising or passing to libraries that do not understand ``BaseSettings``.
    """
    return get_settings().model_dump()


# --------------------------------------------------------------------------- #
# Exported symbols – keep the public surface explicit.
# --------------------------------------------------------------------------- #
__all__ = ["Settings", "get_settings", "as_dict", "logger"]