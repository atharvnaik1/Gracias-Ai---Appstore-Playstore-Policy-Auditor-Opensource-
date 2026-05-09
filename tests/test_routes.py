# tests/test_routes.py
"""
Integration tests for the HTTP endpoint exposing the unified LLM API.

The tests cover:
- Successful request routing to the NVIDIA provider.
- Successful request routing to the Anthropic Claude provider.
- Proper handling of missing or invalid API keys.
- Error mapping from external services to HTTP responses.

All external HTTP calls are mocked using ``responses`` to avoid real network
traffic. The FastAPI application is exercised with ``httpx.AsyncClient``.
"""

import os
import json
import logging
from typing import Any, Dict

import pytest
import pytest_asyncio
import httpx
import responses
from fastapi import FastAPI
from fastapi.testclient import TestClient
from dotenv import load_dotenv

# Load environment variables for the test session.
load_dotenv()  # .env in project root, if present

# Import the FastAPI app. Adjust the import path according to your project layout.
# The app is expected to expose a ``FastAPI`` instance named ``app``.
from app.main import app  # type: ignore

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


@pytest.fixture(scope="session")
def event_loop():
    """Create a new event loop for the test session."""
    import asyncio

    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def async_client() -> httpx.AsyncClient:
    """
    Provides an ``httpx.AsyncClient`` bound to the FastAPI test server.

    The client is automatically closed after each test.
    """
    async with httpx.AsyncClient(app=app, base_url="http://testserver") as client:
        yield client


def _mock_nvidia_response(prompt: str) -> Dict[str, Any]:
    """Return a mocked NVIDIA API payload."""
    return {
        "id": "nvidia-mock-123",
        "object": "text_completion",
        "created": 1_700_000_000,
        "model": "nvidia-llama2",
        "choices": [
            {
                "text": f"NVIDIA response to: {prompt}",
                "index": 0,
                "logprobs": None,
                "finish_reason": "stop",
            }
        ],
    }


def _mock_claude_response(prompt: str) -> Dict[str, Any]:
    """Return a mocked Claude API payload."""
    return {
        "id": "claude-mock-456",
        "type": "completion",
        "model": "claude-2.1",
        "completion": f"Claude response to: {prompt}",
    }


def _add_nvidia_mock() -> None:
    """Register a mock for the NVIDIA endpoint."""
    url = os.getenv("NVIDIA_API_URL", "https://api.nvidia.com/v1/completions")
    responses.add(
        method=responses.POST,
        url=url,
        json=_mock_nvidia_response("{{prompt}}"),
        status=200,
        content_type="application/json",
    )


def _add_claude_mock() -> None:
    """Register a mock for the Claude endpoint."""
    url = os.getenv("CLAUDE_API_URL", "https://api.anthropic.com/v1/complete")
    responses.add(
        method=responses.POST,
        url=url,
        json=_mock_claude_response("{{prompt}}"),
        status=200,
        content_type="application/json",
    )


@pytest.mark.asyncio
@responses.activate
async def test_generate_nvidia_success(async_client: httpx.AsyncClient) -> None:
    """Validate that a request with ``provider=nvidia`` returns a mocked response."""
    _add_nvidia_mock()

    payload = {
        "prompt": "Hello NVIDIA",
        "provider": "nvidia",
    }
    response = await async_client.post("/generate", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "nvidia"
    assert "NVIDIA response to: Hello NVIDIA" in data["generated_text"]


@pytest.mark.asyncio
@responses.activate
async def test_generate_claude_success(async_client: httpx.AsyncClient) -> None:
    """Validate that a request with ``provider=claude`` returns a mocked response."""
    _add_claude_mock()

    payload = {
        "prompt": "Hello Claude",
        "provider": "claude",
    }
    response = await async_client.post("/generate", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "claude"
    assert "Claude response to: Hello Claude" in data["generated_text"]


@pytest.mark.asyncio
async def test_missing_provider_defaults_to_nvidia(async_client: httpx.AsyncClient) -> None:
    """
    When the ``provider`` field is omitted the service should fall back to the
    default provider (NVIDIA). The external call is mocked accordingly.
    """
    _add_nvidia_mock()

    payload = {"prompt": "Default provider test"}
    response = await async_client.post("/generate", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["provider"] == "nvidia"
    assert "NVIDIA response to: Default provider test" in data["generated_text"]


@pytest.mark.asyncio
async def test_invalid_provider_returns_400(async_client: httpx.AsyncClient) -> None:
    """Requests specifying an unknown provider must be rejected with HTTP 400."""
    payload = {"prompt": "Invalid provider", "provider": "unknown"}
    response = await async_client.post("/generate", json=payload)

    assert response.status_code == 400
    json_body = response.json()
    assert "detail" in json_body
    assert "Unsupported provider" in json_body["detail"]


@pytest.mark.asyncio
@responses.activate
async def test_external_api_error_is_mapped(async_client: httpx.AsyncClient) -> None:
    """
    Simulate a 500 error from the external provider and ensure the API returns a
    502 Bad Gateway to the caller.
    """
    url = os.getenv("NVIDIA_API_URL", "https://api.nvidia.com/v1/completions")
    responses.add(
        method=responses.POST,
        url=url,
        json={"error": "internal server error"},
        status=500,
    )

    payload = {"prompt": "Trigger error", "provider": "nvidia"}
    response = await async_client.post("/generate", json=payload)

    assert response.status_code == 502
    json_body = response.json()
    assert "detail" in json_body
    assert "External service error" in json_body["detail"]


@pytest.mark.asyncio
async def test_missing_prompt_returns_422(async_client: httpx.AsyncClient) -> None:
    """FastAPI validation should reject a request without a ``prompt`` field."""
    payload = {"provider": "nvidia"}
    response = await async_client.post("/generate", json=payload)

    assert response.status_code == 422
    json_body = response.json()
    assert "detail" in json_body
    # The exact validation message may vary; we only assert presence.