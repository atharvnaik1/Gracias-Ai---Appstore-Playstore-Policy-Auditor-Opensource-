# app/api_client/nvidia_client.py
"""
Thin wrapper around the NVIDIA LLM REST API.

The client builds authenticated requests, sends them using ``httpx`` and parses
the JSON response into a typed ``NvidiaResponse`` model.  Errors from the
service are mapped to a small hierarchy of custom exceptions.

The module also provides a small helper to retrieve the NVIDIA API key from
environment variables (or a ``.env`` file) while keeping the same interface as
the Claude client – both keys are loaded at import time so that the rest of the
project can rely on a single source of truth for secrets.
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
# Public helper to obtain API keys
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
    choices: list[NvidiaChoice] = Field(..., description="Generated choices")
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
        Base URL of the NVIDIA endpoint.  Defaults to the official public URL.
    timeout : float, optional
        Request timeout in seconds.  ``30.0`` seconds is a safe default.
    """

    base_url: str = "https://api.nvcf.nvidia.com/v1/completions"
    timeout: float = 30.0

    def __post_init__(self) -> None:
        # ``httpx.AsyncClient`` is deliberately *not* stored on the dataclass
        # because it must be created per‑call to avoid keeping open connections
        # across process forks (e.g. when using Gunicorn/Uvicorn workers).
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

        The method builds a request payload, adds the ``Authorization`` header,
        sends the request and returns the generated text of the first choice.

        Parameters
        ----------
        prompt : str
            The user prompt to send to the model.
        model : str, optional
            Model identifier.  Defaults to a widely‑available Llama‑3 model.
        temperature : float, optional
            Sampling temperature (0.0‑2.0).  ``None`` lets the provider use its default.
        max_tokens : int, optional
            Maximum number of tokens to generate.
        top_p : float, optional
            Nucleus sampling parameter (0.0‑1.0).

        Returns
        -------
        str
            The generated text from the model.

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

        payload = NvidiaRequest(
            model=model,
            prompt=prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
        )
        json_payload = payload.model_dump(exclude_none=True)

        headers = {
            "Authorization": f"Bearer {get_nvidia_api_key()}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(
                    self.base_url,
                    headers=headers,
                    json=json_payload,
                )
                _logger.debug(
                    "Received response: status=%s, body=%s",
                    response.status_code,
                    response.text[:200],
                )
            except httpx.RequestError as exc:
                _logger.error("Network error while calling NVIDIA API: %s", exc)
                raise NvidiaError(f"Network error: {exc}") from exc

        # ------------------------------------------------------------------- #
        # HTTP status handling
        # ------------------------------------------------------------------- #
        if response.status_code == 401 or response.status_code == 403:
            _logger.warning("Authentication failed (status=%s)", response.status_code)
            raise NvidiaAuthenticationError("Invalid or missing NVIDIA API key")
        if response.status_code == 429:
            _logger.warning("Rate limit exceeded")
            raise NvidiaRateLimitError("Rate limit exceeded")
        if 500 <= response.status_code < 600:
            _logger.error("Server error from NVIDIA (status=%s)", response.status_code)
            raise NvidiaServerError(
                f"NVIDIA server error {response.status_code}: {response.text}"
            )
        if response.status_code != 200:
            _logger.error(
                "Unexpected status code %s from NVIDIA API: %s",
                response.status_code,
                response.text,
            )
            raise NvidiaError(
                f"Unexpected status {response.status_code}: {response.text}"
            )

        # ------------------------------------------------------------------- #
        # Payload decoding
        # ------------------------------------------------------------------- #
        try:
            data = response.json()
            _logger.debug("Decoded JSON payload: %s", json.dumps(data)[:200])
            nvidia_resp = NvidiaResponse(**data)
        except (json.JSONDecodeError, ValidationError) as exc:
            _logger.exception("Failed to parse NVIDIA response")
            raise NvidiaResponseError(
                f"Failed to parse response: {exc}"
            ) from exc

        if not nvidia_resp.choices:
            _logger.error("NVIDIA response contains no choices")
            raise NvidiaResponseError("No choices returned by NVIDIA API")

        generated_text = nvidia_resp.choices[0].text
        _logger.info("Generated % successfully (tokens=%s)", len(generated_text))
        return generated_text


# --------------------------------------------------------------------------- #
# Convenience singleton for the rest of the project
# --------------------------------------------------------------------------- #
# The project imports ``nvidia_client`` and uses ``nvidia_client.client`` directly.
# This mirrors the pattern used for the Claude client and guarantees that both
# clients are instantiated with the same environment configuration.
client = NvidiaClient()