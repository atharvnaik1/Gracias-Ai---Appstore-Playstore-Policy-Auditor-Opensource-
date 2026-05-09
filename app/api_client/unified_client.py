# app/api_client/unified_client.py
"""
Unified LLM API client.

Provides a single ``generate`` coroutine that forwards the request to the
selected provider (NVIDIA or Anthropic Claude) based on configuration or an
explicit per‑call flag.

The client reads API keys from environment variables (or a ``.env`` file)
and raises a :class:`LLMError` for any transport or provider‑specific
failure.  All network I/O is performed with :mod:`httpx` in async mode.
"""

from __future__ import annotations

import os
import json
import logging
from enum import Enum
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv

# Load ``.env`` if present – this is a no‑op when the file does not exist.
load_dotenv()

# --------------------------------------------------------------------------- #
# Logging configuration (the application can re‑configure the root logger)
# --------------------------------------------------------------------------- #
_logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #
class LLMError(RuntimeError):
    """Raised when a request to an LLM provider fails."""

    def __init__(self, provider: str, message: str, status_code: Optional[int] = None):
        super().__init__(f"[{provider}] {message}")
        self.provider = provider
        self.status_code = status_code


# --------------------------------------------------------------------------- #
# Provider enumeration
# --------------------------------------------------------------------------- #
class Provider(str, Enum):
    """Supported LLM providers."""

    NVIDIA = "nvidia"
    CLAUDE = "claude"


# --------------------------------------------------------------------------- #
# Abstract provider interface
# --------------------------------------------------------------------------- #
class _BaseProvider:
    """Base class for concrete LLM providers."""

    def __init__(self, api_key: str, timeout: float = 30.0):
        if not api_key:
            raise ValueError("API key must be a non‑empty string")
        self._api_key = api_key
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=self._timeout)

    async def generate(self, prompt: str) -> str:
        """Generate a completion for *prompt*."""
        raise NotImplementedError

    async def _post(self, url: str, json_body: Dict[str, Any]) -> httpx.Response:
        """Helper to POST JSON payload with appropriate auth header."""
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        try:
            response = await self._client.post(url, headers=headers, json=json_body)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            _logger.error(
                "Provider %s returned %s – %s",
                self.__class__.__name__,
                exc.response.status_code,
                exc.response.text,
            )
            raise LLMError(
                provider=self.__class__.__name__,
                message=exc.response.text,
                status_code=exc.response.status_code,
            ) from exc
        except httpx.RequestError as exc:
            _logger.exception("Network error while contacting %s", self.__class__.__name__)
            raise LLMError(provider=self.__class__.__name__, message=str(exc)) from exc


# --------------------------------------------------------------------------- #
# NVIDIA implementation
# --------------------------------------------------------------------------- #
class _NvidiaProvider(_BaseProvider):
    """Client for NVIDIA's LLM endpoint."""

    _ENDPOINT = "https://api.nvidia.com/v1/ai/generate"

    async def generate(self, prompt: str) -> str:
        payload = {
            "model": "nvidia/llama-3.1-8b",  # example model; adjust as needed
            "prompt": prompt,
            "max_tokens": 512,
            "temperature": 0.7,
        }
        _logger.debug("Sending request to NVIDIA: %s", payload)
        response = await self._post(self._ENDPOINT, payload)
        data = response.json()
        # NVIDIA's response shape may vary; adapt accordingly.
        try:
            return data["choices"][0]["text"]
        except (KeyError, IndexError) as exc:
            _logger.error("Unexpected NVIDIA response format: %s", data)
            raise LLMError(provider="NVIDIA", message="Invalid response structure") from exc


# --------------------------------------------------------------------------- #
# Anthropic Claude implementation
# --------------------------------------------------------------------------- #
class _ClaudeProvider(_BaseProvider):
    """Client for Anthropic Claude's endpoint."""

    _ENDPOINT = "https://api.anthropic.com/v1/messages"

    async def generate(self, prompt: str) -> str:
        payload = {
            "model": "claude-3-5-sonnet-20240620",  # example model; adjust as needed
            "max_tokens": 1024,
            "temperature": 0.7,
            "messages": [{"role": "user", "content": prompt}],
        }
        _logger.debug("Sending request to Claude: %s", payload)
        response = await self._post(self._ENDPOINT, payload)
        data = response.json()
        try:
            return data["content"][0]["text"]
        except (KeyError, IndexError) as exc:
            _logger.error("Unexpected Claude response format: %s", data)
            raise LLMError(provider="Claude", message="Invalid response structure") from exc


# --------------------------------------------------------------------------- #
# Unified client façade
# --------------------------------------------------------------------------- #
class UnifiedClient:
    """
    Facade exposing a single ``generate`` method.

    The client lazily instantiates provider objects based on environment
    configuration.  Calls can explicitly select a provider via the
    ``provider`` argument; otherwise the ``DEFAULT_PROVIDER`` environment
    variable (or ``nvidia`` as a fallback) is used.
    """

    def __init__(self) -> None:
        # Resolve API keys from the environment.
        self._nvidia_key = os.getenv("NVIDIA_API_KEY", "")
        self._claude_key = os.getenv("CLAUDE_API_KEY", "")

        # Provider instances are created on first use.
        self._nvidia_client: Optional[_NvidiaProvider] = None
        self._claude_client: Optional[_ClaudeProvider] = None

        # Default provider – fallback to NVIDIA if not set.
        default = os.getenv("DEFAULT_PROVIDER", Provider.NVIDIA.value).lower()
        self._default_provider = Provider(default) if default in Provider._value2member_map_ else Provider.NVIDIA

        _logger.info("UnifiedClient initialised – default provider: %s", self._default_provider)

    # ------------------------------------------------------------------- #
    # Lazy provider getters
    # ------------------------------------------------------------------- #
    @property
    def _nvidia(self) -> _NvidiaProvider:
        if self._nvidia_client is None:
            self._nvidia_client = _NvidiaProvider(self._nvidia_key)
            _logger.debug("NVIDIA provider instantiated")
        return self._nvidia_client

    @property
    def _claude(self) -> _ClaudeProvider:
        if self._claude_client is None:
            self._claude_client = _ClaudeProvider(self._claude_key)
            _logger.debug("Claude provider instantiated")
        return self._claude_client

    # ------------------------------------------------------------------- #
    # Public API
    # ------------------------------------------------------------------- #
    async def generate(self, prompt: str, provider: Optional[Provider] = None) -> str:
        """
        Generate a completion for *prompt* using the selected provider.

        Parameters
        ----------
        prompt:
            The user‑supplied prompt.
        provider:
            Optional explicit provider.  If omitted, the client uses the
            ``DEFAULT_PROVIDER`` configuration.

        Returns
        -------
        str
            The generated text.

        Raises
        ------
        LLMError
            If the request fails or the provider is mis‑configured.
        """
        if not prompt:
            raise ValueError("Prompt must be a non‑empty string")

        chosen = provider or self._default_provider
        _logger.info("Generating text – provider: %s", chosen)

        if chosen == Provider.NVIDIA:
            return await self._nvidia.generate(prompt)
        elif chosen == Provider.CLAUDE:
            return await self._claude.generate(prompt)
        else:
            # This branch should never be hit because Provider is an Enum,
            # but we keep it for defensive programming.
            raise LLMError(provider=str(chosen), message="Unsupported provider")

    # ------------------------------------------------------------------- #
    # Graceful shutdown (useful for FastAPI lifespan events)
    # ------------------------------------------------------------------- #
    async def close(self) -> None:
        """Close underlying HTTP clients."""
        if self._nvidia_client:
            await self._nvidia_client._client.aclose()
            _logger.debug("NVIDIA client closed")
        if self._claude_client:
            await self._claude_client._client.aclose()
            _logger.debug("Claude client closed")


# --------------------------------------------------------------------------- #
# Exported symbols
# --------------------------------------------------------------------------- #
__all__ = ["UnifiedClient", "Provider", "LLMError"]