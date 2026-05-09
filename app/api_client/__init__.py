"""
app/api_client/__init__.py

Unified LLM client exposing a single ``generate`` method that internally routes
requests to either the NVIDIA AI Foundations API or the Anthropic Claude API
depending on configuration or a per‑call flag.

The client loads API keys from environment variables (or a ``.env`` file) and
uses ``httpx`` for asynchronous HTTP communication.  Errors from the remote
services are wrapped in :class:`LLMAPIError` to provide a consistent exception
type for callers (e.g. the FastAPI layer).

Typical usage
-------------
>>> from app.api_client import UnifiedLLMClient
>>> client = UnifiedLLMClient()
>>> response = await client.generate("Explain quantum entanglement.", provider="claude")
"""

from __future__ import annotations

import json
import logging
import os
from typing import Literal, Optional, Dict, Any

import httpx
from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
# Environment handling
# --------------------------------------------------------------------------- #
load_dotenv()  # Load .env if present; no‑op otherwise

# --------------------------------------------------------------------------- #
# Logging configuration
# --------------------------------------------------------------------------- #
logger = logging.getLogger(__name__)
if not logger.handlers:  # Prevent duplicate handlers in interactive sessions
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# --------------------------------------------------------------------------- #
# Public exceptions
# --------------------------------------------------------------------------- #
class LLMAPIError(RuntimeError):
    """
    Raised when a remote LLM provider returns an error or when a request cannot
    be completed (network failure, timeout, malformed response, etc.).
    """

    def __init__(self, provider: str, status_code: Optional[int], detail: str) -> None:
        super().__init__(f"{provider.upper()} error [{status_code}]: {detail}")
        self.provider = provider
        self.status_code = status_code
        self.detail = detail


# --------------------------------------------------------------------------- #
# Unified client implementation
# --------------------------------------------------------------------------- #
class UnifiedLLMClient:
    """
    High‑level client that abstracts over NVIDIA and Anthropic Claude LLM services.

    Parameters
    ----------
    nvidia_api_key : str, optional
        API key for NVIDIA AI Foundations.  If omitted the value is read from the
        ``NVIDIA_API_KEY`` environment variable.
    claude_api_key : str, optional
        API key for Anthropic Claude.  If omitted the value is read from the
        ``CLAUDE_API_KEY`` environment variable.
    timeout : float, default 30.0
        Global request timeout (seconds) for both providers.
    """

    _NVIDIA_ENDPOINT = "https://api.nvcf.nvidia.com/v2/nvcf/exec"
    _CLAUDE_ENDPOINT = "https://api.anthropic.com/v1/messages"

    def __init__(
        self,
        *,
        nvidia_api_key: Optional[str] = None,
        claude_api_key: Optional[str] = None,
        timeout: float = 30.0,
    ) -> None:
        self.nvidia_api_key = nvidia_api_key or os.getenv("NVIDIA_API_KEY")
        self.claude_api_key = claude_api_key or os.getenv("CLAUDE_API_KEY")
        self.timeout = timeout

        if not self.nvidia_api_key:
            logger.warning("NVIDIA_API_KEY not set – NVIDIA provider will be unavailable.")
        if not self.claude_api_key:
            logger.warning("CLAUDE_API_KEY not set – Claude provider will be unavailable.")

        # A single shared async client is sufficient; it will be closed automatically
        # when the event loop shuts down (FastAPI does this for us).
        self._http_client = httpx.AsyncClient(timeout=self.timeout)

    # --------------------------------------------------------------------- #
    # Public API
    # --------------------------------------------------------------------- #
    async def generate(
        self,
        prompt: str,
        *,
        provider: Literal["nvidia", "claude"] = "nvidia",
        max_tokens: int = 1024,
        temperature: float = 0.7,
        top_p: Optional[float] = None,
    ) -> str:
        """
        Generate a completion from the selected LLM provider.

        Parameters
        ----------
        prompt : str
            The user supplied prompt.
        provider : {"nvidia", "claude"}, default "nvidia"
            Which backend to use.  The default can be overridden per call.
        max_tokens : int, default 1024
            Maximum number of tokens to generate.
        temperature : float, default 0.7
            Sampling temperature.
        top_p : float, optional
            Nucleus sampling parameter (only supported by Claude).

        Returns
        -------
        str
            The generated text.

        Raises
        ------
        LLMAPIError
            If the remote service returns a non‑2xx response or the response
            cannot be parsed.
        """
        if provider == "nvidia":
            return await self._call_nvidia(prompt, max_tokens, temperature)
        elif provider == "claude":
            return await self._call_claude(prompt, max_tokens, temperature, top_p)
        else:
            raise ValueError(f"Unsupported provider: {provider!r}")

    # --------------------------------------------------------------------- #
    # Provider‑specific implementations
    # --------------------------------------------------------------------- #
    async def _call_nvidia(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        if not self.nvidia_api_key:
            raise LLMAPIError("nvidia", None, "Missing NVIDIA API key")

        payload: Dict[str, Any] = {
            "prompt": prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            # The NVIDIA endpoint expects a ``model`` field; using a generic placeholder.
            "model": "meta/llama-3-8b-instruct",
        }

        headers = {
            "Authorization": f"Bearer {self.nvidia_api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        logger.debug("Sending request to NVIDIA: %s", json.dumps(payload))
        try:
            response = await self._http_client.post(
                self._NVIDIA_ENDPOINT, json=payload, headers=headers
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "NVIDIA responded with %s – %s", exc.response.status_code, exc.response.text
            )
            raise LLMAPIError("nvidia", exc.response.status_code, exc.response.text) from exc
        except httpx.RequestError as exc:
            logger.error("Network error while contacting NVIDIA: %s", str(exc))
            raise LLMAPIError("nvidia", None, str(exc)) from exc

        try:
            data = response.json()
            # NVIDIA returns the generated text under ``choices[0].text`` in many models.
            text = data["choices"][0]["text"]
            logger.debug("NVIDIA response parsed successfully")
            return text
        except (KeyError, json.JSONDecodeError) as exc:
            logger.exception("Failed to parse NVIDIA response")
            raise LLMAPIError("nvidia", response.status_code, "Invalid response format") from exc

    async def _call_claude(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        if not self.claude_api_key:
            raise LLMAPIError("claude", None, "Missing Claude API key")

        messages = [{"role": "user", "content": prompt}]
        payload: Dict[str, Any] = {
            "model": "claude-3-5-sonnet-20240620",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": messages,
        }
        if top_p is not None:
            payload["top_p"] = top_p

        headers = {
            "x-api-key": self.claude_api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }

        logger.debug("Sending request to Claude: %s", json.dumps(payload))
        try:
            response = await self._http_client.post(
                self._CLAUDE_ENDPOINT, json=payload, headers=headers
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Claude responded with %s – %s", exc.response.status_code, exc.response.text
            )
            raise LLMAPIError("claude", exc.response.status_code, exc.response.text) from exc
        except httpx.RequestError as exc:
            logger.error("Network error while contacting Claude: %s", str(exc))
            raise LLMAPIError("claude", None, str(exc)) from exc

        try:
            data = response.json()
            # Claude returns a list of content blocks under ``content``.
            content_blocks = data["content"]
            # Concatenate all text blocks (ignore tool blocks for simplicity).
            text = "".join(
                block["text"] for block in content_blocks if block["type"] == "text"
            )
            logger.debug("Claude response parsed successfully")
            return text
        except (KeyError, json.JSONDecodeError) as exc:
            logger.exception("Failed to parse Claude response")
            raise LLMAPIError("claude", response.status_code, "Invalid response format") from exc

    # --------------------------------------------------------------------- #
    # Graceful shutdown
    # --------------------------------------------------------------------- #
    async def a(self) -> None:
        """Close the underlying HTTP client – call from FastAPI shutdown events."""
        await self._http_client.aclose()


# --------------------------------------------------------------------------- #
# Exported symbols
# --------------------------------------------------------------------------- #
__all__ = ["UnifiedLLMClient", "LLMAPIError"]