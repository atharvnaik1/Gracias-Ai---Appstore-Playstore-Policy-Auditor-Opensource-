python
# src/providers/ai_clients.py
"""
Unified HTTP clients for Anthropic Claude and NVIDIA (OpenAI‑compatible) chat APIs.

Both clients share:
- API‑key validation (environment variable fallback)
- Session handling with retry/back‑off and timeout
- Pydantic request/response models
- Structured logging
- Full type hints, doc‑strings, and exhaustive error handling

The module is import‑safe; callers can instantiate either client independently.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Literal, Optional, Union

import requests
from pydantic import BaseModel, Field, ValidationError, validator
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

# --------------------------------------------------------------------------- #
# Logging configuration (application may configure root logger elsewhere)
# --------------------------------------------------------------------------- #
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #
class ProviderError(RuntimeError):
    """Base class for all provider‑related errors."""


class AuthenticationError(ProviderError):
    """Raised when authentication fails (e.g., missing or invalid API key)."""


class RequestError(ProviderError):
    """Raised when a request to the remote API fails."""


class ResponseError(ProviderError):
    """Raised when the response cannot be parsed or is malformed."""


# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #
def _validate_api_key(env_var: str, key: Optional[str] = None) -> str:
    """
    Retrieve and validate an API key.

    Args:
        env_var: Name of the environment variable that stores the key.
        key: Optional explicit key supplied by the caller.

    Returns:
        A non‑empty API key string.

    Raises:
        AuthenticationError: If the key is missing or empty.
    """
    api_key = key or os.getenv(env_var, "")
    if not isinstance(api_key, str) or not api_key.strip():
        raise AuthenticationError(
            f"{env_var} not found or empty. Set the environment variable or pass the key explicitly."
        )
    return api_key.strip()


def _create_session(retries: int = 3, backoff: float = 0.5) -> requests.Session:
    """
    Create a ``requests.Session`` with retry logic.

    Args:
        retries: Number of total retries for idempotent requests.
        backoff: Back‑off factor for ``urllib3`` retry strategy.

    Returns:
        Configured ``requests.Session`` instance.
    """
    session = requests.Session()
    retry = Retry(
        total=retries,
        backoff_factor=backoff,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST", "PUT", "DELETE"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


# --------------------------------------------------------------------------- #
# Pydantic models – shared between providers where possible
# --------------------------------------------------------------------------- #
class Message(BaseModel):
    """A single chat message."""

    role: Literal["user", "assistant", "system"]
    content: str

    @validator("content")
    def _not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content cannot be empty")
        return v


class ClaudeChatRequest(BaseModel):
    """Payload for Anthropic Claude chat endpoint."""

    model: str = Field(default="claude-3-opus-20240229")
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    temperature: float = Field(default=0.0, ge=0.0, le=1.0)
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    messages: List[Message]
    stream: bool = Field(default=False)

    @validator("messages")
    def _must_have_message(cls, v: List[Message]) -> List[Message]:
        if not v:
            raise ValueError("At least one message must be provided")
        return v


class ClaudeChatResponseChoice(BaseModel):
    """Single choice returned by Claude."""

    index: int
    message: Message
    finish_reason: Optional[str]


class ClaudeChatResponse(BaseModel):
    """Full response payload from Claude."""

    id: str
    model: str
    choices: List[ClaudeChatResponseChoice]
    usage: Optional[Dict[str, Any]]


class NvidiaChatRequest(BaseModel):
    """Payload for NVIDIA (OpenAI‑compatible) chat endpoint."""

    model: str
    messages: List[Message]
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    top_p: Optional[float] = None
    stream: Optional[bool] = None

    @validator("messages")
    def _must_have_message(cls, v: List[Message]) -> List[Message]:
        if not v:
            raise ValueError("At least one message must be provided")
        return v


class NvidiaChatResponseChoice(BaseModel):
    """Single choice returned by NVIDIA."""

    index: int
    message: Message
    finish_reason: Optional[str]


class NvidiaChatResponse(BaseModel):
    """Full response payload from NVIDIA."""

    id: str
    model: str
    choices: List[NvidiaChatResponseChoice]
    usage: Optional[Dict[str, Any]]


# --------------------------------------------------------------------------- #
# Claude client implementation
# --------------------------------------------------------------------------- #
class ClaudeClient:
    """
    Thin HTTP wrapper around the Anthropic Claude API.

    The client reads the ``ANTHROPIC_API_KEY`` environment variable at
    construction time (or accepts an explicit key). All network
    interactions are performed with a ``requests.Session`` that includes
    retry and timeout handling.
    """

    _BASE_URL = "https://api.anthropic.com/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        session: Optional[requests.Session] = None,
    ) -> None:
        """
        Initialise the Claude client.

        Args:
            api_key: Optional explicit API key; if omitted, the
                ``ANTHROPIC_API_KEY`` environment variable is used.
            timeout: Request timeout in seconds.
            session: Optional pre‑configured ``requests.Session``.
        """
        self.api_key: str = _validate_api_key("ANTHROPIC_API_KEY", api_key)
        self.timeout: float = timeout
        self.session: requests.Session = session or _create_session()
        self.session.headers.update(
            {
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            }
        )
        logger.debug("ClaudeClient initialised (timeout=%s)", self.timeout)

    def chat(
        self,
        messages: List[Message],
        model: str = "claude-3-opus-20240229",
        max_tokens: int = 1024,
        temperature: float = 0.0,
        top_p: float = 1.0,
        stream: bool = False,
    ) -> ClaudeChatResponse:
        """
        Send a chat completion request to Claude.

        Args:
            messages: List of ``Message`` objects forming the conversation.
            model: Claude model identifier.
            max_tokens: Maximum number of tokens to generate.
            temperature: Sampling temperature.
            top_p: Nucleus sampling parameter.
            stream: If ``True`` the API will stream partial results
                (the flag is passed through unchanged).

        Returns:
            Parsed ``ClaudeChatResponse`` instance.

        Raises:
            RequestError: Network‑level failures or non‑2xx responses.
            ResponseError: Invalid JSON or missing fields in the response.
        """
        logger.info("Claude chat request – model=%s, messages=%d", model, len(messages))

        # Input validation (Pydantic will raise ValidationError on failure)
        try:
            payload = ClaudeChatRequest(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                messages=messages,
                stream=stream,
            )
        except ValidationError as exc:
            logger.error("Payload validation failed: %s", exc)
            raise RequestError(f"Invalid request payload: {exc}") from exc

        url = f"{self._BASE_URL}/messages"
        try:
            response = self.session.post(
                url,
                data=payload.json(),
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error("HTTP request to Claude failed: %s", exc)
            raise RequestError(f"Claude request failed: {exc}") from exc

        try:
            data = response.json()
            logger.debug("Claude raw response: %s", json.dumps(data)[:500])
            parsed = ClaudeChatResponse.parse_obj(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Failed to parse Claude response: %s", exc)
            raise ResponseError(f"Invalid Claude response: {exc}") from exc

        logger.info("Claude chat response parsed successfully – id=%s", parsed.id)
        return parsed


# --------------------------------------------------------------------------- #
# NVIDIA client implementation
# --------------------------------------------------------------------------- #
class NvidiaClient:
    """
    Thin HTTP wrapper around NVIDIA's OpenAI‑compatible chat API.

    The client reads the ``NVIDIA_API_KEY`` environment variable at
    construction time (or accepts an explicit key). All network
    interactions are performed with a ``requests.Session`` that includes
    retry and timeout handling.
    """

    _BASE_URL = "https://integrate.api.nvidia.com/v1"

    def __init__(
        self,
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        session: Optional[requests.Session] = None,
    ) -> None:
        """
        Initialise the NVIDIA client.

        Args:
            api_key: Optional explicit API key; if omitted, the
                ``NVIDIA_API_KEY`` environment variable is used.
            timeout: Request timeout in seconds.
            session: Optional pre‑configured ``requests.Session``.
        """
        self.api_key: str = _validate_api_key("NVIDIA_API_KEY", api_key)
        self.timeout: float = timeout
        self.session: requests.Session = session or _create_session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
        )
        logger.debug("NvidiaClient initialised (timeout=%s)", self.timeout)

    def chat(
        self,
        messages: List[Message],
        model: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
        stream: Optional[bool] = None,
    ) -> NvidiaChatResponse:
        """
        Send a chat completion request to NVIDIA.

        Args:
            messages: List of ``Message`` objects forming the conversation.
            model: Model identifier (e.g., ``gpt-4o``).
            max_tokens: Optional token limit.
            temperature: Optional temperature.
            top_p: Optional nucleus sampling parameter.
            stream: Optional streaming flag.

        Returns:
            Parsed ``NvidiaChatResponse`` instance.

        Raises:
            RequestError: Network‑level failures or non‑2xx responses.
            ResponseError: Invalid JSON or missing fields in the response.
        """
        logger.info("Nvidia chat request – model=%s, messages=%d", model, len(messages))

        # Input validation (Pydantic will raise ValidationError on failure)
        try:
            payload = NvidiaChatRequest(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                stream=stream,
            )
        except ValidationError as exc:
            logger.error("Payload validation failed: %s", exc)
            raise RequestError(f"Invalid request payload: {exc}") from exc

        url = f"{self._BASE_URL}/chat/completions"
        try:
            response = self.session.post(
                url,
                data=payload.json(),
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            logger.error("HTTP request to NVIDIA failed: %s", exc)
            raise RequestError(f"NVIDIA request failed: {exc}") from exc

        try:
            data = response.json()
            logger.debug("Nvidia raw response: %s", json.dumps(data)[:500])
            parsed = NvidiaChatResponse.parse_obj(data)
        except (json.JSONDecodeError, ValidationError) as exc:
            logger.error("Failed to parse NVIDIA response: %s", exc)
            raise ResponseError(f"Invalid NVIDIA response: {exc}") from exc

        logger.info("Nvidia chat response parsed successfully – id=%s", parsed.id)
        return parsed


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
__all__ = [
    "Message",
    "ClaudeClient",
    "NvidiaClient",
    "ProviderError",
    "AuthenticationError",
    "RequestError",
    "ResponseError",
]
