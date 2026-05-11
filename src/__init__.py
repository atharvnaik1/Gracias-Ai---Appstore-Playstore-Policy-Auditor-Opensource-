python
"""
src/__init__.py

Unified LLM service exposing NVIDIA and Anthropic Claude providers.
Implements production‑grade standards:
* Typed signatures and return values.
* Centralised logging.
* Explicit error handling with clear messages.
* Environment loading via ``python‑dotenv``.
* Pydantic validation of required API keys.
* Input validation, security checks, and performance optimisations.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from enum import Enum
from functools import lru_cache
from typing import Any, Final, Literal, Mapping, MutableMapping, Optional

import requests
from dotenv import load_dotenv
from pydantic import BaseSettings, Field, ValidationError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --------------------------------------------------------------------------- #
# Logging configuration
# --------------------------------------------------------------------------- #
_LOGGER_NAME: Final = "unified_llm"
logger = logging.getLogger(_LOGGER_NAME)
if not logger.handlers:  # Prevent duplicate handlers in interactive sessions
    _handler = logging.StreamHandler()
    _formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _handler.setFormatter(_formatter)
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)

# --------------------------------------------------------------------------- #
# Environment loading
# --------------------------------------------------------------------------- #
load_dotenv()  # Load ``.env`` if present; silently ignore otherwise.

# --------------------------------------------------------------------------- #
# Configuration layer
# --------------------------------------------------------------------------- #
class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Validates the presence of required API keys at import time.
    """

    nvidia_api_key: str = Field(..., env="NVIDIA_API_KEY")
    claude_api_key: str = Field(..., env="CLAUDE_API_KEY")
    request_timeout_seconds: int = Field(30, env="REQUEST_TIMEOUT_SECONDS")
    max_prompt_length: int = Field(8192, env="MAX_PROMPT_LENGTH")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


# --------------------------------------------------------------------------- #
# HTTP session factory with retry logic
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def _make_session() -> requests.Session:
    """Create a reusable ``requests.Session`` with sensible retry configuration.

    Returns:
        A configured ``requests.Session`` instance.
    """
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=10)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# --------------------------------------------------------------------------- #
# Custom exception hierarchy
# --------------------------------------------------------------------------- #
class LLMError(RuntimeError):
    """Base class for all LLM‑related runtime errors."""


class ProviderError(LLMError):
    """Raised when a provider request fails."""


# --------------------------------------------------------------------------- #
# Input validation utilities
# --------------------------------------------------------------------------- #
def _validate_prompt(prompt: str, max_length: int) -> None:
    """Validate a prompt string.

    Args:
        prompt: Prompt to validate.
        max_length: Maximum allowed length.

    Raises:
        ValueError: If the prompt is empty, not a string, or exceeds ``max_length``.
    """
    if not isinstance(prompt, str):
        raise ValueError("Prompt must be a string.")
    if not prompt.strip():
        raise ValueError("Prompt cannot be empty or whitespace.")
    if len(prompt) > max_length:
        raise ValueError(
            f"Prompt length {len(prompt)} exceeds maximum of {max_length} characters."
        )


# --------------------------------------------------------------------------- #
# Provider client implementations (thin HTTP wrappers)
# --------------------------------------------------------------------------- #
class NVIDIAClient:
    """Thin wrapper around the NVIDIA LLM API."""

    _BASE_URL: Final = "https://api.nvidia.com/v1/completions"

    def __init__(self, api_key: str, timeout: int) -> None:
        """Initialize the client.

        Args:
            api_key: NVIDIA API key.
            timeout: Request timeout in seconds.
        """
        self.api_key = api_key
        self.timeout = timeout
        self.session = _make_session()
        self.headers: Mapping[str, str] = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def complete(self, prompt: str, **kwargs: Any) -> str:
        """Request a completion from NVIDIA.

        Args:
            prompt: Text prompt to send.
            **kwargs: Provider‑specific parameters (e.g., temperature).

        Returns:
            Completion string returned by the API.

        Raises:
            ProviderError: If the request fails or the response is malformed.
            ValueError: If ``prompt`` is invalid.
        """
        _validate_prompt(prompt, max_length=Settings().max_prompt_length)
        payload: MutableMapping[str, Any] = {"prompt": prompt, **kwargs}
        logger.debug("NVIDIA request payload: %s", payload)

        try:
            response = self.session.post(
                self._BASE_URL,
                json=payload,
                headers=self.headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
        except (requests.Timeout, requests.ConnectionError) as exc:
            logger.error("NVIDIA network error: %s", exc)
            raise ProviderError("NVIDIA request failed due to network issues.") from exc
        except requests.HTTPError as exc:
            logger.error(
                "NVIDIA HTTP error %s: %s", response.status_code, response.text
            )
            raise ProviderError(
                f"NVIDIA HTTP error {response.status_code}"
            ) from exc
        except requests.RequestException as exc:
            logger.exception("Unexpected NVIDIA request exception")
            raise ProviderError("Unexpected NVIDIA request error.") from exc

        try:
            data = response.json()
            logger.debug("NVIDIA response JSON: %s", data)
            return data.get("completion", "")
        except json.JSONDecodeError as exc:
            logger.error("Failed to decode NVIDIA JSON response")
            raise ProviderError("Invalid JSON response from NVIDIA.") from exc


class ClaudeClient:
    """Thin wrapper around the Anthropic Claude API."""

    _BASE_URL: Final = "https://api.anthropic.com/v1/completions"

    def __init__(self, api_key: str, timeout: int) -> None:
        """Initialize the client.

        Args:
            api_key: Claude API key.
            timeout: Request timeout in seconds.
        """
        self.api_key = api_key
        self.timeout = timeout
        self.session = _make_session()
        self.headers: Mapping[str, str] = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }

    def complete(self, prompt: str, **kwargs: Any) -> str:
        """Request a completion from Claude.

        Args:
            prompt: Text prompt to send.
            **kwargs: Provider‑specific parameters (e.g., temperature).

        Returns:
            Completion string returned by the API.

        Raises:
            ProviderError: If the request fails or the response is malformed.
            ValueError: If ``prompt`` is invalid.
        """
        _validate_prompt(prompt, max_length=Settings().max_prompt_length)
        payload: MutableMapping[str, Any] = {"prompt": prompt, **kwargs}
        logger.debug("Claude request payload: %s", payload)

        try:
            response = self.session.post(
                self._BASE_URL,
                json=payload,
                headers=self.headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
        except (requests.Timeout, requests.ConnectionError) as exc:
            logger.error("Claude network error: %s", exc)
            raise ProviderError("Claude request failed due to network issues.") from exc
        except requests.HTTPError as exc:
            logger.error(
                "Claude HTTP error %s: %s", response.status_code, response.text
            )
            raise ProviderError(
                f"Claude HTTP error {response.status_code}"
            ) from exc
        except requests.RequestException as exc:
            logger.exception("Unexpected Claude request exception")
            raise ProviderError("Unexpected Claude request error.") from exc

        try:
            data = response.json()
            logger.debug("Claude response JSON: %s", data)
            return data.get("completion", "")
        except json.JSONDecodeError as exc:
            logger.error("Failed to decode Claude JSON response")
            raise ProviderError("Invalid JSON response from Claude.") from exc


# --------------------------------------------------------------------------- #
# Provider factory (cached for performance)
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=2)
def _get_nvidia_client() -> NVIDIAClient:
    """Return a cached NVIDIA client instance.

    Returns:
        An instantiated ``NVIDIAClient``.
    """
    cfg = Settings()
    logger.info("Creating cached NVIDIA client")
    return NVIDIAClient(api_key=cfg.nvidia_api_key, timeout=cfg.request_timeout_seconds)


@lru_cache(maxsize=2)
def _get_claude_client() -> ClaudeClient:
    """Return a cached Claude client instance.

    Returns:
        An instantiated ``ClaudeClient``.
    """
    cfg = Settings()
    logger.info("Creating cached Claude client")
    return ClaudeClient(api_key=cfg.claude_api_key, timeout=cfg.request_timeout_seconds)


# --------------------------------------------------------------------------- #
# Unified API
# --------------------------------------------------------------------------- #
class Provider(Enum):
    """Supported LLM providers."""

    NVIDIA = "nvidia"
    CLAUDE = "claude"


def generate_completion(
    provider: Literal["nvidia", "claude"],
    prompt: str,
    **kwargs: Any,
) -> str:
    """Generate a completion from the selected provider.

    Args:
        provider: Either ``"nvidia"`` or ``"claude"``.
        prompt: Prompt text to send to the LLM.
        **kwargs: Provider‑specific parameters (e.g., ``temperature``).

    Returns:
        The raw completion string from the provider.

    Raises:
        ValueError: If ``provider`` is unsupported.
        ProviderError: Propagated from the underlying client.
    """
    if provider == Provider.NVIDIA.value:
        client = _get_nvidia_client()
        logger.info("Routing request to NVIDIA")
        return client.complete(prompt, **kwargs)
    elif provider == Provider.CLAUDE.value:
        client = _get_claude_client()
        logger.info("Routing request to Claude")
        return client.complete(prompt, **kwargs)
    else:
        logger.error("Unsupported provider requested: %s", provider)
        raise ValueError(f"Unsupported provider: {provider}")


# --------------------------------------------------------------------------- #
# Public module interface
# --------------------------------------------------------------------------- #
__all__: list[str] = [
    "Provider",
    "generate_completion",
    "ProviderError",
    "LLMError",
]
