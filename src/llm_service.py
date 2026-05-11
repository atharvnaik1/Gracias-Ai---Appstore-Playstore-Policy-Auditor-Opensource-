python
# src/llm_service.py
"""
Production‑grade façade for LLM completions.

Supports three providers – NVIDIA NVCF, Anthropic Claude, and OpenAI GPT – exposing a
single :class:`LLMService` with a :meth:`complete` method.  Features include:

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
    openai_api_key: Optional[str] = Field(
        default=None, env="OPENAI_API_KEY", description="OpenAI API key"
    )
    nvidia_endpoint: str = Field(
        default="https://api.nvcf.nvidia.com/v2/nvcf/exec",
        description="NVIDIA NVCF endpoint",
    )
    claude_endpoint: str = Field(
        default="https://api.anthropic.com/v1/complete",
        description="Anthropic Claude endpoint",
    )
    openai_endpoint: str = Field(
        default="https://api.openai.com/v1/chat/completions",
        description="OpenAI endpoint",
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

    @validator("nvidia_api_key", "claude_api_key", "openai_api_key")
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


class OpenAIRequestPayload(TypedDict, total=False):
    model: str
    messages: list[dict[str, str]]
    max_tokens: int
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
            raise LLMConfigurationError(
                "NVIDIA_API_KEY is not set. Please provide a valid NVIDIA API key."
            )
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
            return response["choices"][0]["text"]
        except (KeyError, IndexError) as exc:
            _logger.error("Unexpected NVIDIA response format: %s", response, exc_info=True)
            raise LLMProviderError("Invalid response from NVIDIA NVCF") from exc


class ClaudeClient(BaseLLMClient):
    """Thin wrapper around Anthropic Claude completion API."""

    def __init__(self) -> None:
        if not _config.claude_api_key:
            raise LLMConfigurationError(
                "CLAUDE_API_KEY is not set. Please provide a valid Anthropic API key."
            )
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
        Request a completion from Anthropic Claude.

        Args:
            prompt: Prompt text (already validated).

        Returns:
            Completion string.

        Raises:
            LLMProviderError: If the response format is unexpected.
        """
        payload: ClaudeRequestPayload = {
            "model": "claude-2.0",
            "prompt": prompt,
            "max_tokens_to_sample": 512,
            "temperature": 0.7,
            "top_p": 0.9,
        }
        response = self._post(payload, self.headers)
        try:
            return response["completion"]
        except KeyError as exc:
            _logger.error("Unexpected Claude response format: %s", response, exc_info=True)
            raise LLMProviderError("Invalid response from Anthropic Claude") from exc


class OpenAIClient(BaseLLMClient):
    """Thin wrapper around OpenAI Chat Completion API."""

    def __init__(self) -> None:
        if not _config.openai_api_key:
            raise LLMConfigurationError(
                "OPENAI_API_KEY is not set. Please provide a valid OpenAI API key."
            )
        super().__init__(
            endpoint=_config.openai_endpoint,
            timeout=_config.request_timeout,
            max_retries=_config.max_retries,
        )
        self.headers: dict[str, str] = {
            "Authorization": f"Bearer {_config.openai_api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def complete(self, prompt: str) -> str:
        """
        Request a chat completion from OpenAI.

        Args:
            prompt: Prompt text (already validated).

        Returns:
            Completion string.

        Raises:
            LLMProviderError: If the response format is unexpected.
        """
        payload: OpenAIRequestPayload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 512,
            "temperature": 0.7,
            "top_p": 0.9,
        }
        response = self._post(payload, self.headers)
        try:
            return response["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            _logger.error("Unexpected OpenAI response format: %s", response, exc_info=True)
            raise LLMProviderError("Invalid response from OpenAI") from exc


# --------------------------------------------------------------------------- #
# High‑level façade
# --------------------------------------------------------------------------- #
class LLMService:
    """Unified interface for LLM completions across supported providers."""

    def __init__(self, provider: Literal["nvidia", "claude", "openai"] = "openai") -> None:
        self.provider_name = provider.lower()
        if self.provider_name == "nvidia":
            self.client = NVIDIAClient()
        elif self.provider_name == "claude":
            self.client = ClaudeClient()
        elif self.provider_name == "openai":
            self.client = OpenAIClient()
        else:
            raise LLMConfigurationError(
                f"Unsupported provider '{provider}'. Choose from 'nvidia', 'claude', 'openai'."
            )
        _logger.info("LLMService initialized with provider: %s", self.provider_name)

    def _validate_prompt(self, prompt: str) -> None:
        """Validate prompt length and disallowed patterns."""
        if len(prompt) > _config.max_prompt_length:
            raise LLMInputError(
                f"Prompt exceeds maximum length of {_config.max_prompt_length} characters."
            )
        for pattern in _config.disallowed_patterns:
            if re.search(pattern, prompt):
                raise LLMInputError("Prompt contains prohibited content.")

    def complete(self, prompt: str) -> str:
        """
        Generate a completion using the configured provider.

        Args:
            prompt: User‑provided prompt text.

        Returns:
            Completion string from the chosen LLM provider.

        Raises:
            LLMInputError: Invalid or unsafe prompt.
            LLMProviderError: Provider‑level failure.
        """
        self._validate_prompt(prompt)
        try:
            result = self.client.complete(prompt)
            _logger.debug("Completion result: %s", result[:200])
            return result
        except LLMProviderError as exc:
            _logger.error("Provider error during completion: %s", exc, exc_info=True)
            raise