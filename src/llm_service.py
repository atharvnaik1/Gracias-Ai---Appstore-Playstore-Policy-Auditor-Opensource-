python
# src/llm_service.py
"""
Production‑grade façade for LLM completions.

Supports two providers – NVIDIA NVCF and Anthropic Claude – exposing a single
:class:`LLMService` with a :meth:`complete` method.  Features include:

* Environment‑based configuration loading with ``.env`` support
* Strict input validation and security checks
* Typed request/response payloads
* Automatic retry, timeout and exponential back‑off handling
* Detailed logging (debug → error)
* Precise exception hierarchy for callers
* Full type hints and exhaustive docstrings
"""

from __future__ import annotations

import json
import logging
import re
from typing import Literal, Mapping, Optional, TypedDict, Union

import requests
from pydantic import BaseSettings, Field, validator
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --------------------------------------------------------------------------- #
# Logging configuration (singleton per process)
# --------------------------------------------------------------------------- #
_logger = logging.getLogger(__name__)
if not _logger.handlers:  # Guard against duplicate handlers on import
    _handler = logging.StreamHandler()
    _handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    _logger.addHandler(_handler)
    _logger.setLevel(logging.INFO)


# --------------------------------------------------------------------------- #
# Configuration model (validated via pydantic)
# --------------------------------------------------------------------------- #
class LLMConfig(BaseSettings):
    """Application‑wide configuration loaded from environment variables or ``.env``."""

    nvidia_api_key: Optional[str] = Field(
        default=None, env="NVIDIA_API_KEY", description="NVIDIA API key"
    )
    claude_api_key: Optional[str] = Field(
        default=None, env="CLAUDE_API_KEY", description="Anthropic Claude API key"
    )
    nvidia_endpoint: str = Field(
        default="https://api.nvcf.nvidia.com/v2/nvcf/exec",
        description="NVIDIA NVCF endpoint",
    )
    claude_endpoint: str = Field(
        default="https://api.anthropic.com/v1/complete",
        description="Anthropic Claude endpoint",
    )
    request_timeout: int = Field(
        default=30, description="HTTP request timeout in seconds"
    )
    max_retries: int = Field(default=3, description="Maximum retry attempts")
    max_prompt_length: int = Field(
        default=4096, description="Maximum allowed prompt length in characters"
    )
    disallowed_patterns: list[str] = Field(
        default=["(?i)\\b(?:DROP|DELETE|INSERT|UPDATE)\\b"],
        description="Regex patterns that are prohibited in prompts",
    )

    @validator("nvidia_api_key", "claude_api_key")
    def _strip_empty(cls, v: Optional[str]) -> Optional[str]:
        """Normalize empty strings to ``None`` and reject pure whitespace."""
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("API key cannot be an empty string")
        return v

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


_config = LLMConfig()
_logger.debug("LLM configuration loaded: %s", _config.json(exclude_unset=True))


# --------------------------------------------------------------------------- #
# Exception hierarchy
# --------------------------------------------------------------------------- #
class LLMServiceError(RuntimeError):
    """Base class for all service‑level errors."""


class LLMConfigurationError(LLMServiceError):
    """Raised when required configuration is missing or invalid."""


class LLMProviderError(LLMServiceError):
    """Raised when a provider returns an unexpected response."""


class LLMInputError(LLMServiceError):
    """Raised when user input fails validation."""


# --------------------------------------------------------------------------- #
# Typed request payloads (for static analysis / readability)
# --------------------------------------------------------------------------- #
class NVIDIARequestPayload(TypedDict, total=False):
    prompt: str
    max_tokens: int
    temperature: float
    top_p: float


class ClaudeRequestPayload(TypedDict, total=False):
    model: str
    prompt: str
    max_tokens_to_sample: int
    temperature: float
    top_p: float


# --------------------------------------------------------------------------- #
# Low‑level HTTP client with retry/timeout logic
# --------------------------------------------------------------------------- #
class BaseLLMClient:
    """Common HTTP client functionality with retry, timeout and logging."""

    def __init__(self, endpoint: str, timeout: int, max_retries: int) -> None:
        self.endpoint = endpoint
        self.timeout = timeout
        self.session = requests.Session()
        retry = Retry(
            total=max_retries,
            backoff_factor=0.5,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"],
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def _post(self, payload: Mapping[str, object], headers: Mapping[str, str]) -> dict:
        """
        Execute a POST request and return the decoded JSON body.

        Args:
            payload: JSON‑serialisable request body.
            headers: HTTP request headers.

        Returns:
            Parsed JSON response.

        Raises:
            LLMProviderError: Network failure, non‑2xx status, or JSON decode error.
        """
        try:
            _logger.debug(
                "POST %s | payload=%s | headers=%s", self.endpoint, payload, headers
            )
            response = self.session.post(
                self.endpoint,
                json=payload,
                headers=headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            _logger.debug(
                "Response %s | body=%s", response.status_code, response.text[:200]
            )
            return response.json()
        except requests.RequestException as exc:
            _logger.error("HTTP request failed: %s", exc, exc_info=True)
            raise LLMProviderError(f"Request to {self.endpoint} failed") from exc
        except json.JSONDecodeError as exc:
            _logger.error("Invalid JSON response: %s", exc, exc_info=True)
            raise LLMProviderError("Failed to decode JSON response") from exc


# --------------------------------------------------------------------------- #
# Provider‑specific clients
# --------------------------------------------------------------------------- #
class NVIDIAClient(BaseLLMClient):
    """Thin wrapper around NVIDIA NVCF completion API."""

    def __init__(self) -> None:
        if not _config.nvidia_api_key:
            raise LLMConfigurationError("NVIDIA_API_KEY is not set")
        super().__init__(
            endpoint=_config.nvidia_endpoint,
            timeout=_config.request_timeout,
            max_retries=_config.max_retries,
        )
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {_config.nvidia_api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def complete(self, prompt: str) -> str:
        """
        Request a completion from NVIDIA.

        Args:
            prompt: Prompt text (already validated).

        Returns:
            Completion string.

        Raises:
            LLMProviderError: If the response format is unexpected.
        """
        payload: NVIDIARequestPayload = {
            "prompt": prompt,
            "max_tokens": 512,
            "temperature": 0.7,
            "top_p": 0.9,
        }
        response = self._post(payload, self.headers)
        try:
            # NVIDIA's response format may vary; we expect a ``choices`` list.
            completion = response["choices"][0]["text"]
            _logger.debug("NVIDIA completion received")
            return completion
        except (KeyError, IndexError, TypeError) as exc:
            _logger.error("Unexpected NVIDIA response format: %s", response, exc_info=True)
            raise LLMProviderError("Invalid response structure from NVIDIA") from exc


class ClaudeClient(BaseLLMClient):
    """Thin wrapper around Anthropic Claude completion API."""

    def __init__(self) -> None:
        if not _config.claude_api_key:
            raise LLMConfigurationError("CLAUDE_API_KEY is not set")
        super().__init__(
            endpoint=_config.claude_endpoint,
            timeout=_config.request_timeout,
            max_retries=_config.max_retries,
        )
        self.headers: dict[str, str] = {
            "x-api-key": _config.claude_api_key,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def complete(self, prompt: str) -> str:
        """
        Request a completion from Claude.

        Args:
            prompt: Prompt text (already validated).

        Returns:
            Completion string.

        Raises:
            LLMProviderError: If the response format is unexpected.
        """
        payload: ClaudeRequestPayload = {
            "model": "claude-v1",
            "prompt": prompt,
            "max_tokens_to_sample": 512,
            "temperature": 0.7,
            "top_p": 0.9,
        }
        response = self._post(payload, self.headers)
        try:
            # Claude returns a ``completion`` field.
            completion = response["completion"]
            _logger.debug("Claude completion received")
            return completion
        except (KeyError, TypeError) as exc:
            _logger.error("Unexpected Claude response format: %s", response, exc_info=True)
            raise LLMProviderError("Invalid response structure from Claude") from exc


# --------------------------------------------------------------------------- #
# Public service façade
# --------------------------------------------------------------------------- #
class LLMService:
    """Facade exposing a unified ``complete`` method for multiple LLM providers."""

    def __init__(self) -> None:
        self._nvidia_client: Optional[NVIDIAClient] = None
        self._claude_client: Optional[ClaudeClient] = None

    @staticmethod
    def _validate_prompt(prompt: str) -> None:
        """
        Validate prompt length and disallowed content.

        Args:
            prompt: Prompt text.

        Raises:
            LLMInputError: If validation fails.
        """
        if not isinstance(prompt, str):
            raise LLMInputError("Prompt must be a string")
        if len(prompt) > _config.max_prompt_length:
            raise LLMInputError(
                f"Prompt exceeds maximum length of {_config.max_prompt_length} characters"
            )
        for pattern in _config.disallowed_patterns:
            if re.search(pattern, prompt):
                raise LLMInputError(
                    f"Prompt contains prohibited pattern: {pattern}"
                )
        _logger.debug("Prompt validation passed")

    def _get_nvidia_client(self) -> NVIDIAClient:
        """Lazily instantiate NVIDIA client."""
        if self._nvidia_client is None:
            self._nvidia_client = NVIDIAClient()
            _logger.info("NVIDIA client instantiated")
        return self._nvidia_client

    def _get_claude_client(self) -> ClaudeClient:
        """Lazily instantiate Claude client."""
        if self._claude_client is None:
            self._claude_client = ClaudeClient()
            _logger.info("Claude client instantiated")
        return self._claude_client

    def complete(
        self,
        provider: Literal["nvidia", "claude"],
        prompt: str,
    ) -> str:
        """
        Generate a completion using the selected provider.

        Args:
            provider: Either ``"nvidia"`` or ``"claude"``.
            prompt: Prompt text to send to the LLM.

        Returns:
            Completion string from the selected provider.

        Raises:
            LLMInputError: If the prompt is invalid.
            LLMProviderError: If the provider fails to return a valid completion.
            LLMConfigurationError: If required configuration for the provider is missing.
        """
        _logger.info("Completion request – provider=%s", provider)
        self._validate_prompt(prompt)

        if provider == "nvidia":
            client = self._get_nvidia_client()
        elif provider == "claude":
            client = self._get_claude_client()
        else:
            raise LLMInputError(f"Unsupported provider: {provider}")

        try:
            completion = client.complete(prompt)
            _logger.info("Completion successful – provider=%s", provider)
            return completion
        except LLMProviderError as exc:
            _logger.error(
                "Provider %s failed: %s", provider, exc, exc_info=True
            )
            raise
