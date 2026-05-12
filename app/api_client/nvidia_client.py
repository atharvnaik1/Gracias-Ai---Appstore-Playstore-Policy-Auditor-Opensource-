python
# app/api_client/nvidia_client.py
"""
Thin wrapper around the NVIDIA LLM REST API.

The client builds authenticated requests, sends them using ``httpx`` and parses
the JSON response into a typed ``NvidiaResponse`` model. Errors from the
service are mapped to a small hierarchy of custom exceptions.

The module also provides a small helper to retrieve the NVIDIA API key from
environment variables (or a ``.env`` file) while keeping the same interface as
the Claude client – both keys are loaded at import time so that the rest of the
project can rely on a single source of truth for secrets.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional, Sequence

import httpx
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

# --------------------------------------------------------------------------- #
# Load environment variables (including .env) once at import time
# --------------------------------------------------------------------------- #
load_dotenv()

# --------------------------------------------------------------------------- #
# Logging configuration (module‑level logger)
# --------------------------------------------------------------------------- #
_logger = logging.getLogger(__name__)
if not _logger.handlers:
    # Prevent duplicate handlers when the module is reloaded in tests
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        fmt="%(asctime)s %(levelname)s %(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    _logger.addHandler(handler)
    _logger.setLevel(logging.INFO)


# --------------------------------------------------------------------------- #
# Public helpers to obtain API keys
# --------------------------------------------------------------------------- #
def get_nvidia_api_key() -> str:
    """
    Retrieve the NVIDIA API key from the environment.

    Returns
    -------
    str
        The API key.

    Raises
    ------
    RuntimeError
        If the key is not defined.
    """
    key = os.getenv("NVIDIA_API_KEY")
    if not key:
        raise RuntimeError("NVIDIA_API_KEY not set in environment")
    return key


def get_claude_api_key() -> str:
    """
    Retrieve the Claude API key from the environment.

    Returns
    -------
    str
        The API key.

    Raises
    ------
    RuntimeError
        If the key is not defined.
    """
    key = os.getenv("CLAUDE_API_KEY")
    if not key:
        raise RuntimeError("CLAUDE_API_KEY not set in environment")
    return key


# --------------------------------------------------------------------------- #
# Pydantic models for request / response payloads
# --------------------------------------------------------------------------- #
class NvidiaRequest(BaseModel):
    """
    Model representing the JSON payload sent to the NVIDIA LLM endpoint.
    """

    model: str = Field(..., description="Identifier of the model to use")
    prompt: str = Field(..., description="User prompt")
    temperature: Optional[float] = Field(
        None,
        ge=0.0,
        le=2.0,
        description="Sampling temperature; omitted defaults to provider default",
    )
    max_tokens: Optional[int] = Field(
        None,
        ge=1,
        description="Maximum number of tokens to generate",
    )
    top_p: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Top‑p nucleus sampling; omitted defaults to provider default",
    )


class NvidiaChoice(BaseModel):
    """
    A single generated choice in the response.
    """

    text: str = Field(..., description="Generated text")
    index: int = Field(..., description="Choice index")
    finish_reason: Optional[str] = Field(
        None,
        description="Reason the model stopped generating (e.g. 'stop', 'length')",
    )


class NvidiaResponse(BaseModel):
    """
    Model representing the JSON response from the NVIDIA LLM endpoint.
    """

    id: str = Field(..., description="Response identifier")
    object: Literal["text_completion"] = Field(..., description="Object type")
    created: int = Field(..., description="Unix timestamp of generation")
    model: str = Field(..., description="Model used")
    choices: Sequence[NvidiaChoice] = Field(..., description="Generated choices")
    usage: Optional[Dict[str, int]] = Field(
        None,
        description="Token usage statistics (prompt/completion/total)",
    )


# --------------------------------------------------------------------------- #
# Custom exception hierarchy
# --------------------------------------------------------------------------- #
class NvidiaError(Exception):
    """Base class for all NVIDIA client errors."""


class NvidiaAuthenticationError(NvidiaError):
    """Raised when authentication fails (e.g. 401/403)."""


class NvidiaRateLimitError(NvidiaError):
    """Raised when the API returns a rate‑limit response."""


class NvidiaServerError(NvidiaError):
    """Raised for 5xx responses from the NVIDIA service."""


class NvidiaResponseError(NvidiaError):
    """Raised when the response payload cannot be parsed."""


# --------------------------------------------------------------------------- #
# Main client implementation
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class NvidiaClient:
    """
    Asynchronous client for the NVIDIA LLM API.

    Parameters
    ----------
    base_url : str, optional
        Base URL of the NVIDIA endpoint. Defaults to the official public URL.
    timeout : float, optional
        Request timeout in seconds. ``30.0`` seconds is a safe default.
    """

    base_url: str = "https://api.nvcf.nvidia.com/v1/completions"
    timeout: float = 30.0

    def __post_init__(self) -> None:
        _logger.debug("NvidiaClient initialised with base_url=%s", self.base_url)

    async def generate(
        self,
        prompt: str,
        *,
        model: str = "meta/llama3-70b-instruct",
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
    ) -> str:
        """
        Generate a completion for ``prompt`` using the NVIDIA LLM service.

        Parameters
        ----------
        prompt : str
            The user prompt to send to the model.
        model : str, optional
            Model identifier. Defaults to a widely‑available Llama‑3 model.
        temperature : float, optional
            Sampling temperature (0.0‑2.0). ``None`` lets the provider use its default.
        max_tokens : int, optional
            Maximum number of tokens to generate.
        top_p : float, optional
            Nucleus sampling parameter (0.0‑1.0).

        Returns
        -------
        str
            The generated text from the first choice.

        Raises
        ------
        NvidiaAuthenticationError
            If the API key is missing or invalid.
        NvidiaRateLimitError
            If the request is throttled.
        NvidiaServerError
            For 5xx responses.
        NvidiaResponseError
            If the response payload cannot be decoded.
        """
        _logger.info("Generating completion for model=%s", model)

        # Validate prompt early to give a clear error before network call
        if not isinstance(prompt, str) or not prompt.strip():
            raise ValueError("prompt must be a non‑empty string")

        # Build request payload using Pydantic for validation
        request_payload = NvidiaRequest(
            model=model,
            prompt=prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
        )
        json_payload = request_payload.model_dump(exclude_none=True)

        # Prepare HTTP client and headers
        headers = {
            "Authorization": f"Bearer {get_nvidia_api_key()}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    self.base_url,
                    json=json_payload,
                    headers=headers,
                )
                response.raise_for_status()
            except httpx.HTTPStatusError as exc:
                status = exc.response.status_code
                _logger.error(
                    "HTTP %s error from NVIDIA API: %s", status, exc.response.text
                )
                if status in (401, 403):
                    raise NvidiaAuthenticationError(
                        f"Authentication failed (status {status})"
                    ) from exc
                if status == 429:
                    raise NvidiaRateLimitError(
                        "Rate limit exceeded (status 429)"
                    ) from exc
                if 500 <= status < 600:
                    raise NvidiaServerError(
                        f"Server error (status {status})"
                    ) from exc
                raise NvidiaError(
                    f"Unexpected HTTP error (status {status})"
                ) from exc
            except httpx.RequestError as exc:
                _logger.exception("Network error while contacting NVIDIA API")
                raise NvidiaError(f"Network error: {exc}") from exc

        # Parse and validate JSON response
        try:
            payload: Dict[str, Any] = response.json()
            nvidia_resp = NvidiaResponse.model_validate(payload)
        except (ValueError, ValidationError) as exc:
            _logger.exception("Failed to decode or validate NVIDIA response")
            raise NvidiaResponseError("Invalid response payload") from exc

        if not nvidia_resp.choices:
            _logger.error("NVIDIA response contains no choices")
            raise NvidiaResponseError("No completion choices returned")

        result_text = nvidia_resp.choices[0].text
        _logger.debug("Generated text: %s", result_text[:100])  # log first 100 chars
        return result_text
