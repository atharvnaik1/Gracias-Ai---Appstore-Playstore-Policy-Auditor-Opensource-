# app/api_client/claude_client.py
"""
Thin wrapper around Anthropic Claude API.

Provides a simple async interface to generate text completions.
Both Anthropic (Claude) and NVIDIA API keys are loaded from the environment
so that the rest of the project can rely on them being present.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

# --------------------------------------------------------------------------- #
# Load environment variables (including .env files) as early as possible.
# --------------------------------------------------------------------------- #
load_dotenv()  # reads .env into os.environ if present

# --------------------------------------------------------------------------- #
# Logging configuration – the library uses the module's logger.
# --------------------------------------------------------------------------- #
logger = logging.getLogger(__name__)
if not logger.handlers:
    # Simple console logger for library usage; the application can re‑configure.
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #
class ClaudeError(RuntimeError):
    """Base exception for all Claude client errors."""


class AuthenticationError(ClaudeError):
    """Raised when the API key is missing or invalid."""


class RequestConstructionError(ClaudeError):
    """Raised when the request payload cannot be built."""


class APIResponseError(ClaudeError):
    """Raised when the Claude API returns a non‑successful status."""


# --------------------------------------------------------------------------- #
# Pydantic models for request/response validation
# --------------------------------------------------------------------------- #
class ClaudeMessage(BaseModel):
    """Message format required by Anthropic's /v1/messages endpoint."""

    role: Literal["user", "assistant"] = Field(..., description="Message role.")
    content: str = Field(..., description="Message content.")


class ClaudeRequest(BaseModel):
    """Payload sent to the Claude API."""

    model: str = Field(..., description="Claude model identifier.")
    max_tokens: int = Field(..., ge=1, le=4096, description="Maximum tokens to generate.")
    temperature: float = Field(0.7, ge=0.0, le=1.0, description="Sampling temperature.")
    messages: list[ClaudeMessage] = Field(..., description="Conversation history.")
    stream: bool = Field(False, description="Whether to stream partial results.")


class ClaudeResponseChoice(BaseModel):
    """Single completion choice returned by Claude."""

    index: int = Field(..., description="Choice index.")
    message: ClaudeMessage = Field(..., description="Generated message.")
    finish_reason: Optional[str] = Field(
        None, description="Why the generation stopped (e.g., stop, length)."
    )


class ClaudeResponse(BaseModel):
    """Top‑level response from Claude."""

    id: str = Field(..., description="Response identifier.")
    model: str = Field(..., description="Model used.")
    usage: Dict[str, Any] = Field(..., description="Token usage statistics.")
    choices: list[ClaudeResponseChoice] = Field(..., description="Generated completions.")


# --------------------------------------------------------------------------- #
# Configuration dataclass – centralises env‑var access.
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ClaudeConfig:
    """Configuration required by the Claude client."""

    api_key: str
    base_url: str = "https://api.anthropic.com/v1"
    timeout: float = 30.0

    @staticmethod
    def from_env() -> "ClaudeConfig":
        """Create a configuration instance from environment variables."""
        api_key = os.getenv("CLAUDE_API_KEY") or os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise AuthenticationError(
                "Claude API key not found. Set CLAUDE_API_KEY or ANTHROPIC_API_KEY."
            )
        # NVIDIA key is also loaded here for project‑wide availability.
        nvidia_key = os.getenv("NVIDIA_API_KEY")
        if not nvidia_key:
            logger.warning("NVIDIA_API_KEY not set – downstream components may fail.")
        return ClaudeConfig(api_key=api_key)


# --------------------------------------------------------------------------- #
# Core client implementation
# --------------------------------------------------------------------------- #
class ClaudeClient:
    """Async client for Anthropic Claude API.

    Example
    -------
    >>> client = ClaudeClient()
    >>> response = await client.generate("Write a haiku about sunrise.")
    >>> print(response)
    """

    def __init__(self, config: Optional[ClaudeConfig] = None) -> None:
        self._config = config or ClaudeConfig.from_env()
        self._client = httpx.AsyncClient(
            base_url=self._config.base_url,
            timeout=self._config.timeout,
            headers={
                "x-api-key": self._config.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        logger.debug("ClaudeClient initialized with base_url=%s", self._config.base_url)

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        await self._client.aclose()
        logger.debug("ClaudeClient HTTP client closed.")

    async def generate(
        self,
        prompt: str,
        *,
        model: str = "claude-3-5-sonnet-20240620",
        max_tokens: int = 1024,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
    ) -> str:
        """
        Generate a completion from Claude.

        Parameters
        ----------
        prompt : str
            The user‑provided prompt.
        model : str, optional
            Claude model identifier. Defaults to ``claude-3-5-sonnet-20240620``.
        max_tokens : int, optional
            Maximum number of tokens to generate. Defaults to ``1024``.
        temperature : float, optional
            Sampling temperature between 0.0 and 1.0. Defaults to ``0.7``.
        system_prompt : str, optional
            Optional system‑level instruction that is prepended to the conversation.

        Returns
        -------
        str
            The generated text.

        Raises
        ------
        ClaudeError
            For any failure interacting with the Claude API.
        """
        logger.info(
            "Generating completion: model=%s, max_tokens=%s, temperature=%s",
            model,
            max_tokens,
            temperature,
        )

        messages: list[ClaudeMessage] = []
        if system_prompt:
            messages.append(ClaudeMessage(role="user", content=system_prompt))
        messages.append(ClaudeMessage(role="user", content=prompt))

        try:
            payload = ClaudeRequest(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=messages,
                stream=False,
            ).model_dump()
        except ValidationError as exc:
            logger.exception("Failed to construct request payload.")
            raise RequestConstructionError(str(exc)) from exc

        try:
            response = await self._client.post("/messages", json=payload)
        except httpx.RequestError as exc:
            logger.exception("Network error while calling Claude API.")
            raise ClaudeError(f"Network error: {exc}") from exc

        if response.status_code != 200:
            logger.error(
                "Claude API returned non‑200 status: %s – %s",
                response.status_code,
                response.text,
            )
            raise APIResponseError(
                f"API error {response.status_code}: {response.text}"
            )

        try:
            data = response.json()
            parsed = ClaudeResponse.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.exception("Failed to parse Claude response.")
            raise APIResponseError(f"Invalid response format: {exc}") from exc

        # Claude returns a list of choices – we only request a single one.
        if not parsed.choices:
            raise APIResponseError("No choices returned by Claude.")
        generated = parsed.choices[0].message.content
        logger.debug("Claude generation successful, %s characters.", len(generated))
        return generated

    # --------------------------------------------------------------------- #
    # Context‑manager helpers for convenience
    # --------------------------------------------------------------------- #
    async def __aenter__(self) -> "ClaudeClient":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.close()


# --------------------------------------------------------------------------- #
# Exported symbols for ``from .claude_client import *``
# --------------------------------------------------------------------------- #
__all__ = [
    "ClaudeClient",
    "ClaudeError",
    "AuthenticationError",
    "RequestConstructionError",
    "APIResponseError",
    "ClaudeConfig",
]