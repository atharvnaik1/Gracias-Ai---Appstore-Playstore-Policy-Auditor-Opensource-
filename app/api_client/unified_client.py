python
# app/api_client/unified_client.py
"""
Unified LLM API client.

Provides a single ``generate`` coroutine that forwards the request to the
selected provider (NVIDIA or Anthropic Claude) based on configuration or an
explicit per‑call flag.

The client reads API keys from environment variables (or a ``.env`` file)
and raises :class:`LLMError` for any transport or provider‑specific failure.
All network I/O is performed with :mod:`httpx` in async mode.
"""

from __future__ import annotations

import os
import logging
from enum import Enum
from typing import Any, Dict, Literal, Optional

import httpx
from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
# Load environment variables (no‑op if ``.env`` does not exist)
# --------------------------------------------------------------------------- #
load_dotenv()

# --------------------------------------------------------------------------- #
# Logging configuration (application may re‑configure the root logger)
# --------------------------------------------------------------------------- #
_logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #
class LLMError(RuntimeError):
    """Raised when a request to an LLM provider fails."""

    def __init__(
        self,
        provider: str,
        message: str,
        status_code: Optional[int] = None,
    ) -> None:
        super().__init__(f"[{provider}] {message}")
        self.provider = provider
        self.status_code = status_code

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"{self.__class__.__name__}(provider={self.provider!r}, "
            f"message={self.args[0]!r}, status_code={self.status_code!r})"
        )

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

    def __init__(self, api_key: str, timeout: float = 30.0) -> None:
        if not api_key:
            raise ValueError("API key must be a non‑empty string")
        self._api_key = api_key
        self._timeout = timeout
        self._client = httpx.AsyncClient(timeout=self._timeout)

    async def generate(self, prompt: str) -> str:
        """Generate a completion for *prompt*."""
        raise NotImplementedError

    async def _post(self, url: str, json_body: Dict[str, Any]) -> httpx.Response:
        """POST JSON payload with appropriate auth header."""
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
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
            _logger.exception(
                "Network error while contacting %s", self.__class__.__name__
            )
            raise LLMError(provider=self.__class__.__name__, message=str(exc)) from exc

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()


# --------------------------------------------------------------------------- #
# NVIDIA implementation
# --------------------------------------------------------------------------- #
class _NvidiaProvider(_BaseProvider):
    """Client for NVIDIA's LLM endpoint."""

    _ENDPOINT = "https://api.nvidia.com/v1/ai/generate"

    async def generate(self, prompt: str) -> str:
        payload: Dict[str, Any] = {
            "model": "nvidia/llama-3.1-8b",  # adjust as needed
            "prompt": prompt,
            "max_tokens": 512,
            "temperature": 0.7,
        }
        _logger.debug("Sending request to NVIDIA: %s", payload)
        response = await self._post(self._ENDPOINT, payload)
        data = response.json()
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
        payload: Dict[str, Any] = {
            "model": "claude-3-5-sonnet-20240620",  # adjust as needed
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
    configuration. Calls can explicitly select a provider via the ``provider``
    argument; otherwise the ``DEFAULT_PROVIDER`` environment variable (or
    ``nvidia`` as a fallback) is used.
    """

    def __init__(self) -> None:
        # Resolve API keys from the environment.
        self._nvidia_key = os.getenv("NVIDIA_API_KEY", "")
        self._claude_key = os.getenv("CLAUDE_API_KEY", "")

        # Provider instances are created on first use.
        self._nvidia_client: Optional[_NvidiaProvider] = None
        self._claude_client: Optional[_ClaudeProvider] = None

        # Determine default provider – fallback to NVIDIA if the env var is missing
        # or contains an unknown value.
        default_raw = os.getenv("DEFAULT_PROVIDER", Provider.NVIDIA.value).lower()
        self._default_provider = (
            Provider(default_raw)
            if default_raw in Provider._value2member_map_
            else Provider.NVIDIA
        )

        _logger.info(
            "UnifiedClient initialised – default provider: %s", self._default_provider
        )

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
    async def generate(
        self,
        prompt: str,
        provider: Optional[Literal["nvidia", "claude"]] = None,
    ) -> str:
        """
        Generate a completion for *prompt* using the selected provider.

        Parameters
        ----------
        prompt:
            The user‑supplied prompt. Must be a non‑empty string.
        provider:
            Optional explicit provider name (``"nvidia"`` or ``"claude"``). If omitted,
            the client falls back to the default provider resolved at
            construction time.

        Returns
        -------
        str
            The generated completion text.

        Raises
        ------
        ValueError
            If *prompt* is empty or *provider* is not a recognized value.
        LLMError
            Propagated from the underlying provider when the request fails.
        """
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("Prompt must be a non‑empty string")

        # Resolve the provider to use.
        selected: Provider = (
            Provider(provider) if provider else self._default_provider
        )
        _logger.debug("Generating with provider %s", selected)

        if selected is Provider.NVIDIA:
            return await self._nvidia.generate(prompt)
        elif selected is Provider.CLAUDE:
            return await self._claude.generate(prompt)
        else:  # pragma: no cover – defensive programming
            raise ValueError(f"Unsupported provider: {selected}")

    async def close(self) -> None:
        """Close any underlying HTTP connections."""
        # Close both providers if they have been instantiated.
        tasks = []
        if self._nvidia_client:
            tasks.append(self._nvidia_client.close())
        if self._claude_client:
            tasks.append(self._claude_client.close())
        if tasks:
            await httpx.AsyncClient()._run_tasks(*tasks)  # noqa: SLF001

    # ------------------------------------------------------------------- #
    # Context‑manager helpers (optional convenience)
    # ------------------------------------------------------------------- #
    async def __aenter__(self) -> "UnifiedClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:  # pragma: no cover
        await self.close()
