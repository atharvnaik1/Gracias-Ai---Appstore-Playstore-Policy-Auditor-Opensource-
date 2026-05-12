python
# app/__init__.py
"""
Package initializer for the LLM micro‑service.

- Configures a structured logger.
- Loads environment variables from a ``.env`` file (if present) using
  ``python‑dotenv``.
- Provides a small helper to retrieve API keys for supported providers
  (NVIDIA and Anthropic Claude) with clear error handling, validation and
  type hints.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Final, Literal, Mapping, Set

from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
# Logging configuration
# --------------------------------------------------------------------------- #
_LOG_FORMAT: Final = (
    "%(asctime)s | %(levelname)-8s | %(name)s | %(funcName)s:%(lineno)d | %(message)s"
)
logging.basicConfig(
    level=logging.INFO,
    format=_LOG_FORMAT,
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Environment loading
# --------------------------------------------------------------------------- #
_ENV_PATH: Final = Path(__file__).resolve().parents[1] / ".env"

if _ENV_PATH.is_file():
    # ``override=False`` protects already‑set environment variables – the safest
    # default for containerised deployments.
    load_dotenv(dotenv_path=_ENV_PATH, override=False)
    logger.info("Loaded environment variables from %s", _ENV_PATH)
else:
    logger.debug("No .env file found at %s; relying on the host environment", _ENV_PATH)

# --------------------------------------------------------------------------- #
# Supported providers and their environment variable mapping
# --------------------------------------------------------------------------- #
_SUPPORTED_PROVIDERS: Final[Set[Literal["nvidia", "claude"]]] = {"nvidia", "claude"}

_ENV_VAR_MAP: Final[Mapping[Literal["nvidia", "claude"], str]] = {
    "nvidia": "NVIDIA_API_KEY",
    "claude": "CLAUDE_API_KEY",
}


class ProviderError(ValueError):
    """Raised when an unsupported LLM provider is requested."""


def _validate_provider(provider: str) -> Literal["nvidia", "claude"]:
    """
    Validate the ``provider`` argument.

    Parameters
    ----------
    provider: str
        Provider name supplied by the caller.

    Returns
    -------
    Literal["nvidia", "claude"]
        Normalised, lower‑cased provider name.

    Raises
    ------
    ProviderError
        If ``provider`` is empty or not one of the supported values.
    """
    if not provider:
        raise ProviderError("Provider name must be a non‑empty string.")

    normalized = provider.lower()
    if normalized not in _SUPPORTED_PROVIDERS:
        raise ProviderError(
            f"Unsupported provider '{provider}'. Supported providers are "
            f"{', '.join(sorted(_SUPPORTED_PROVIDERS))}."
        )
    return normalized  # type: ignore[return-value]


def get_api_key(provider: str) -> str:
    """
    Retrieve the API key for a given LLM provider.

    Parameters
    ----------
    provider: str
        The name of the provider (case‑insensitive). Supported values are
        ``"nvidia"`` and ``"claude"``.

    Returns
    -------
    str
        The secret API key.

    Raises
    ------
    ProviderError
        If the provider is not supported.
    KeyError
        If the corresponding environment variable is missing.
    """
    provider_key = _validate_provider(provider)

    env_var = _ENV_VAR_MAP[provider_key]
    api_key = os.getenv(env_var)

    if not api_key:
        raise KeyError(
            f"Environment variable '{env_var}' is not set. "
            "Ensure the secret is defined in the environment or .env file."
        )

    logger.debug("Retrieved API key for provider %s", provider_key)
    return api_key


# --------------------------------------------------------------------------- #
# Public symbols
# --------------------------------------------------------------------------- #
__all__: list[str] = ["logger", "get_api_key", "ProviderError", "SUPPORTED_PROVIDERS"]
