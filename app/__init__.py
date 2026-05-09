# app/__init__.py
"""
Package initializer for the LLM micro‑service.

- Configures a structured logger.
- Loads environment variables from a ``.env`` file (if present) using
  ``python‑dotenv``.
- Provides a small helper to retrieve API keys for supported providers
  (NVIDIA and Anthropic Claude) with clear error handling.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Final

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
    # ``override=True`` ensures that existing environment variables are not
    # silently overwritten by the .env file – this is the safest default for
    # containerised deployments.
    load_dotenv(dotenv_path=_ENV_PATH, override=False)
    logger.info("Loaded environment variables from %s", _ENV_PATH)
else:
    logger.debug("No .env file found at %s; relying on the host environment", _ENV_PATH)

# --------------------------------------------------------------------------- #
# API‑key helper
# --------------------------------------------------------------------------- #
_SUPPORTED_PROVIDERS: Final[set[str]] = {"nvidia", "claude"}

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
    ValueError
        If the provider is not supported.
    KeyError
        If the corresponding environment variable is missing.
    """
    provider_key = provider.lower()
    if provider_key not in _SUPPORTED_PROVIDERS:
        raise ValueError(
            f"Unsupported provider '{provider}'. Supported providers: "
            f"{', '.join(sorted(_SUPPORTED_PROVIDERS))}"
        )

    env_var = {
        "nvidia": "NVIDIA_API_KEY",
        "claude": "CLAUDE_API_KEY",
    }[provider_key]

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
__all__: list[str] = ["logger", "get_api_key"]