python
# src/providers/llm_clients.py
"""
Production‑ready LLM HTTP clients for NVIDIA and Anthropic Claude.

Both clients are thread‑safe, use connection pooling, implement retries,
validate inputs, and raise explicit, typed exceptions. API keys are
loaded from environment variables (NVIDIA_API_KEY, CLAUDE_API_KEY) and
validated on start‑up, guaranteeing that any part of the project can
rely on a correctly configured client.

Typical usage
-------------
from src.providers.llm_clients import NvidiaClient, ClaudeClient, CompletionRequest

nvidia = NvidiaClient()
claude = ClaudeClient()
response = nvidia.complete(CompletionRequest(model="gpt-4", prompt="Hello"))
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Union

import requests
from pydantic import BaseModel, Field, ValidationError, validator

# --------------------------------------------------------------------------- #
# Configuration constants
# --------------------------------------------------------------------------- #
NVIDIA_API_KEY_ENV = "NVIDIA_API_KEY"
CLAUDE_API_KEY_ENV = "CLAUDE_API_KEY"
NVIDIA_BASE_URL = "https://api.nvidia.com/v1"
CLAUDE_BASE_URL = "https://api.anthropic.com/v1"
DEFAULT_TIMEOUT = 30  # seconds
MAX_RETRIES = 3
BACKOFF_FACTOR = 0.5
_API_KEY_REGEX = re.compile(r"^[A-Za-z0-9\-_]{20,}$")  # simple sanity check

# --------------------------------------------------------------------------- #
# Logging configuration (module level)
# --------------------------------------------------------------------------- #
_logger = logging.getLogger(__name__)
if not _logger.handlers:
    _handler = logging.StreamHandler()
    _formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _handler.setFormatter(_formatter)
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)


# --------------------------------------------------------------------------- #
# Pydantic models for request / response payloads
# --------------------------------------------------------------------------- #
class CompletionRequest(BaseModel):
    """Payload for a completion request."""

    model: str = Field(..., description="Model identifier, e.g. 'gpt-4'")
    prompt: str = Field(..., description="User prompt")
    max_tokens: Optional[int] = Field(
        None,
        ge=1,
        description="Maximum number of tokens to generate",
    )
    temperature: Optional[float] = Field(
        None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature",
    )
    top_p: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Nucleus sampling probability",
    )
    stop: Optional[Union[str, List[str]]] = Field(
        None,
        description="Stop sequences (string or list of strings)",
    )

    @validator("model")
    def _model_must_be_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("model must be a non‑empty string")
        return v

    @validator("prompt")
    def _prompt_must_be_nonempty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("prompt must be a non‑empty string")
        return v


class CompletionChoice(BaseModel):
    """Single completion choice returned by the API."""

    text: str
    index: int
    logprobs: Optional[Dict[str, Any]] = None
    finish_reason: Optional[str] = None


class CompletionResponse(BaseModel):
    """Top‑level response model."""

    id: str
    object: str
    created: int
    model: str
    choices: List[CompletionChoice]
    usage: Optional[Dict[str, Any]] = None


# --------------------------------------------------------------------------- #
# Exception hierarchy
# --------------------------------------------------------------------------- #
class LLMClientError(RuntimeError):
    """Base class for all client‑side errors."""


class AuthenticationError(LLMClientError):
    """Raised when authentication fails (invalid or missing API key)."""


class APIError(LLMClientError):
    """Raised for non‑2xx HTTP responses."""

    def __init__(
        self,
        status_code: int,
        message: str,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(f"{status_code}: {message}")
        self.status_code = status_code
        self.payload = payload


# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #
def _validate_api_key(key: str, name: str) -> None:
    """
    Perform a lightweight sanity check on an API key.

    Args:
        key: The raw API key string.
        name: Human‑readable name for logging / error messages.

    Raises:
        AuthenticationError: If the key does not match the expected pattern.
    """
    if not _API_KEY_REGEX.fullmatch(key):
        raise AuthenticationError(f"{name} does not appear to be a valid API key")
    _logger.debug("%s passed format validation", name)


def _load_api_key(env_var: str, name: str) -> str:
    """
    Load an API key from an environment variable and validate it.

    Args:
        env_var: Environment variable name.
        name: Human‑readable identifier for logging / error messages.

    Returns:
        The API key string.

    Raises:
        AuthenticationError: If the variable is missing or invalid.
    """
    key = os.getenv(env_var)
    if not key:
        raise AuthenticationError(f"Environment variable {env_var} is not set for {name}")
    _validate_api_key(key, name)
    _logger.debug("%s loaded from %s", name, env_var)
    return key


def _build_session() -> requests.Session:
    """
    Create a ``requests.Session`` with a retry strategy.

    Returns:
        Configured ``Session`` instance.
    """
    session = requests.Session()
    retry = requests.packages.urllib3.util.retry.Retry(
        total=MAX_RETRIES,
        backoff_factor=BACKOFF_FACTOR,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
        raise_on_status=False,
    )
    adapter = requests.adapters.HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    _logger.debug("HTTP session with retry strategy created")
    return session


# --------------------------------------------------------------------------- #
# Base client (shared functionality)
# --------------------------------------------------------------------------- #
class _BaseLLMClient:
    """Common functionality for LLM HTTP clients."""

    def __init__(
        self,
        base_url: str,
        api_key_env: str,
        api_name: str,
        timeout: int = DEFAULT_TIMEOUT,
    ) -> None:
        """
        Initialise the client.

        Args:
            base_url: Base URL of the LLM service.
            api_key_env: Environment variable holding the API key.
            api_name: Human‑readable name for logging.
            timeout: Request timeout in seconds.

        Raises:
            AuthenticationError: If the API key is missing or invalid.
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.api_key = _load_api_key(api_key_env, api_name)
        self.session = _build_session()
        self.session.headers.update(
            {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            }
        )
        _logger.info(
            "%s client initialised – base_url=%s, timeout=%s", api_name, self.base_url, self.timeout
        )

    @staticmethod
    def _handle_response(resp: requests.Response) -> Dict[str, Any]:
        """
        Parse JSON response or raise APIError.

        Args:
            resp: ``requests.Response`` object.

        Returns:
            Parsed JSON payload.

        Raises:
            APIError: If the response status is not 2xx or JSON decoding fails.
        """
        try:
            payload = resp.json()
        except json.JSONDecodeError as exc:
            raise APIError(resp.status_code, "Invalid JSON response", None) from exc

        if not resp.ok:
            message = payload.get("error", resp.reason)
            raise APIError(resp.status_code, message, payload)

        _logger.debug("Response %s parsed successfully", resp.status_code)
        return payload

    def _post(
        self,
        endpoint: str,
        json_body: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Perform a POST request with error handling.

        Args:
            endpoint: API endpoint relative to ``base_url``.
            json_body: JSON‑serialisable payload.

        Returns:
            Parsed JSON response.

        Raises:
            APIError: For HTTP or transport errors.
        """
        url = f"{self.base_url}{endpoint}"
        _logger.debug("POST %s – payload: %s", url, json_body)
        try:
            resp = self.session.post(url, json=json_body, timeout=self.timeout)
        except requests.RequestException as exc:
            raise APIError(0, f"Network error: {exc}", None) from exc

        return self._handle_response(resp)


# --------------------------------------------------------------------------- #
# NVIDIA client
# --------------------------------------------------------------------------- #
class NvidiaClient(_BaseLLMClient):
    """Thread‑safe client for NVIDIA LLM API."""

    def __init__(self, timeout: int = DEFAULT_TIMEOUT) -> None:
        """
        Initialise the NVIDIA client.

        Args:
            timeout: Request timeout in seconds.

        Raises:
            AuthenticationError: If the NVIDIA API key is missing or invalid.
        """
        super().__init__(
            base_url=NVIDIA_BASE_URL,
            api_key_env=NVIDIA_API_KEY_ENV,
            api_name="NVIDIA",
            timeout=timeout,
        )

    def complete(self, request: CompletionRequest) -> CompletionResponse:
        """
        Send a completion request to NVIDIA.

        Args:
            request: ``CompletionRequest`` instance.

        Returns:
            ``CompletionResponse`` parsed from the API response.

        Raises:
            ValidationError: If ``request`` fails Pydantic validation.
            APIError: If the remote API returns an error.
        """
        try:
            payload = request.dict(exclude_none=True)
        except ValidationError as exc:
            _logger.error("Request validation failed: %s", exc)
            raise

        _logger.info("NVIDIA completion request – model=%s", request.model)
        raw = self._post("/completion", payload)
        try:
            response = CompletionResponse.parse_obj(raw)
        except ValidationError as exc:
            _logger.error("Response validation failed: %s", exc)
            raise APIError(0, "Invalid response format", raw) from exc

        _logger.info("NVIDIA completion succeeded – id=%s", response.id)
        return response


# --------------------------------------------------------------------------- #
# Claude client
# --------------------------------------------------------------------------- #
class ClaudeClient(_BaseLLMClient):
    """Thread‑safe client for Anthropic Claude API."""

    def __init__(self, timeout: int = DEFAULT_TIMEOUT) -> None:
        """
        Initialise the Claude client.

        Args:
            timeout: Request timeout in seconds.

        Raises:
            AuthenticationError: If the Claude API key is missing or invalid.
        """
        super().__init__(
            base_url=CLAUDE_BASE_URL,
            api_key_env=CLAUDE_API_KEY_ENV,
            api_name="Claude",
            timeout=timeout,
        )

    def complete(self, request: CompletionRequest) -> CompletionResponse:
        """
        Send a completion request to Claude.

        Args:
            request: ``CompletionRequest`` instance.

        Returns:
            ``CompletionResponse`` parsed from the API response.

        Raises:
            ValidationError: If ``request`` fails Pydantic validation.
            APIError: If the remote API returns an error.
        """
        try:
            payload = request.dict(exclude_none=True)
        except ValidationError as exc:
            _logger.error("Request validation failed: %s", exc)
            raise

        _logger.info("Claude completion request – model=%s", request.model)
        raw = self._post("/complete", payload)
        try:
            response = CompletionResponse.parse_obj(raw)
        except ValidationError as exc:
            _logger.error("Response validation failed: %s", exc)
            raise APIError(0, "Invalid response format", raw) from exc

        _logger.info("Claude completion succeeded – id=%s", response.id)
        return response


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #
__all__ = [
    "CompletionRequest",
    "CompletionResponse",
    "NvidiaClient",
    "ClaudeClient",
    "LLMClientError",
    "AuthenticationError",
    "APIError",
]
