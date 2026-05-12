# tests/test_unified_client.py
"""
Unit tests for the UnifiedClient.

The UnifiedClient abstracts two LLM providers (NVIDIA and Anthropic Claude) and
exposes a single ``generate`` method.  The tests verify:

* Correct routing based on the ``provider`` argument.
* Proper handling of successful responses.
* Propagation of provider‑specific errors as UnifiedClientError.
* Fallback to the default provider when no explicit provider is given.
"""

import os
import json
import logging
from unittest import mock

import pytest
import pytest_asyncio
import httpx

from api_client.unified_client import UnifiedClient, UnifiedClientError

# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest_asyncio.fixture
async def client() -> UnifiedClient:
    """
    Create a UnifiedClient instance with environment‑derived configuration.
    The test suite relies on the presence of the following environment variables:
    - NVIDIA_API_KEY
    - ANTHROPIC_API_KEY
    """
    # Ensure the keys are present for the client initialisation.
    os.environ.setdefault("NVIDIA_API_KEY", "test-nvidia-key")
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-claude-key")
    return UnifiedClient()


# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #
def _mock_response(status_code: int, payload: dict) -> httpx.Response:
    """Create a mocked httpx.Response."""
    return httpx.Response(
        status_code=status_code,
        content=json.dumps(payload).encode(),
        request=httpx.Request("POST", "http://test"),
    )


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_generate_with_nvidia_provider(client: UnifiedClient) -> None:
    """UnifiedClient should forward the request to the NVIDIA endpoint."""
    prompt = "Hello, NVIDIA!"
    mock_payload = {"choices": [{"text": "NVIDIA response"}]}

    with mock.patch.object(httpx.AsyncClient, "post", return_value=_mock_response(200, mock_payload)):
        response = await client.generate(prompt, provider="nvidia")
        assert response == "NVIDIA response"
        # Verify that the correct base URL is used internally.
        called_url = httpx.AsyncClient.post.call_args[0][0]  # type: ignore[index]
        assert "nvidia" in called_url.lower()


@pytest.mark.asyncio
async def test_generate_with_claude_provider(client: UnifiedClient) -> None:
    """UnifiedClient should forward the request to the Anthropic Claude endpoint."""
    prompt = "Hello, Claude!"
    mock_payload = {"completion": "Claude response"}

    with mock.patch.object(httpx.AsyncClient, "post", return_value=_mock_response(200, mock_payload)):
        response = await client.generate(prompt, provider="claude")
        assert response == "Claude response"
        called_url = httpx.AsyncClient.post.call_args[0][0]  # type: ignore[index]
        assert "anthropic" in called_url.lower()


@pytest.mark.asyncio
async def test_generate_default_provider_fallback(client: UnifiedClient) -> None:
    """
    When ``provider`` is omitted the client should use the default provider
    (NVIDIA in this implementation).  The test confirms that the default
    routing works and that the response is correctly extracted.
    """
    prompt = "Default provider test"
    mock_payload = {"choices": [{"text": "Default NVIDIA response"}]}

    with mock.patch.object(httpx.AsyncClient, "post", return_value=_mock_response(200, mock_payload)):
        response = await client.generate(prompt)  # No provider argument
        assert response == "Default NVIDIA response"
        called_url = httpx.AsyncClient.post.call_args[0][0]  # type: ignore[index]
        assert "nvidia" in called_url.lower()


@pytest.mark.asyncio
async def test_error_handling_nvidia_error(client: UnifiedClient) -> None:
    """Provider‑specific HTTP errors should be wrapped in UnifiedClientError."""
    prompt = "Trigger error"

    error_payload = {"error": {"message": "Invalid request"}}
    with mock.patch.object(httpx.AsyncClient, "post", return_value=_mock_response(400, error_payload)):
        with pytest.raises(UnifiedClientError) as exc_info:
            await client.generate(prompt, provider="nvidia")
        assert "Invalid request" in str(exc_info.value)


@pytest.mark.asyncio
async def test_error_handling_claude_error(client: UnifiedClient) -> None:
    """Provider‑specific HTTP errors should be wrapped in UnifiedClientError."""
    prompt = "Trigger error"

    error_payload = {"error": {"type": "invalid_request_error", "message": "Bad prompt"}}
    with mock.patch.object(httpx.AsyncClient, "post", return_value=_mock_response(422, error_payload)):
        with pytest.raises(UnifiedClientError) as exc_info:
            await client.generate(prompt, provider="claude")
        assert "Bad prompt" in str(exc_info.value)


@pytest.mark.asyncio
async def test_missing_api_key_raises(client: UnifiedClient) -> None:
    """
    If the required environment variable for a provider is missing,
    UnifiedClient should raise a clear error before attempting the request.
    """
    # Remove the NVIDIA key temporarily.
    original_key = os.environ.pop("NVIDIA_API_KEY", None)

    try:
        with pytest.raises(UnifiedClientError) as exc_info:
            await client.generate("test", provider="nvidia")
        assert "NVIDIA_API_KEY" in str(exc_info.value)
    finally:
        # Restore the key for other tests.
        if original_key:
            os.environ["NVIDIA_API_KEY"] = original_key


# --------------------------------------------------------------------------- #
# Logging sanity check (optional)
# --------------------------------------------------------------------------- #
def test_logger_configuration() -> None:
    """Ensure the UnifiedClient logger is configured with a sensible level."""
    logger = logging.getLogger("api_client.unified_client")
    assert logger.level in (logging.INFO, logging.DEBUG, logging.WARNING, logging.ERROR)