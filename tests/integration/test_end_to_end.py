python
# tests/integration/test_end_to_end.py
"""
Integration tests for the unified LLM service.

The tests spin up mock HTTP endpoints for the two supported providers
(NVIDIA and Anthropic Claude) and verify that the service correctly
routes requests, handles API keys, and returns the expected
completion payloads.
"""

import os
import json
import logging
from typing import Dict, List

import pytest
import responses
from pydantic import BaseModel, ValidationError

# Import the unified service – adjust the import path to match your project.
# The service is expected to expose a ``get_completion`` function that
# accepts ``provider`` and ``prompt`` arguments.
from myapp.llm_service import LLMService, Provider, CompletionResult

# --------------------------------------------------------------------------- #
# Test utilities
# --------------------------------------------------------------------------- #

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.DEBUG)


class MockProviderResponse(BaseModel):
    """Schema for the mocked provider response."""
    id: str
    object: str
    created: int
    model: str
    choices: List[Dict]


def _mock_nvidia_endpoint(prompt: str) -> Dict:
    """Return a deterministic mock response for the NVIDIA provider."""
    return {
        "id": "nvidia-mock-1",
        "object": "text_completion",
        "created": 1_699_999_999,
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


def _mock_claude_endpoint(prompt: str) -> Dict:
    """Return a deterministic mock response for the Claude provider."""
    return {
        "id": "claude-mock-1",
        "object": "text_completion",
        "created": 1_699_999_999,
        "model": "claude-2.1",
        "choices": [
            {
                "text": f"Claude response to: {prompt}",
                "index": 0,
                "logprobs": None,
                "finish_reason": "stop",
            }
        ],
    }


def _mock_health_endpoint() -> Dict:
    """Mock health endpoint payload."""
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture(autouse=True)
def set_api_and_vercel_keys(monkeypatch):
    """
    Ensure API keys and Vercel environment variables are present for the duration of the tests.
    """
    # API keys for providers
    monkeypatch.setenv("NVIDIA_API_KEY", "test-nvidia-key")
    monkeypatch.setenv("CLAUDE_API_KEY", "test-claude-key")
    # Vercel environment variables
    monkeypatch.setenv("VERCEL_URL", "http://localhost:3000")
    monkeypatch.setenv("VERCEL_ENV", "development")
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "dummysha123456")
    # Timeout configuration (seconds)
    monkeypatch.setenv("REQUEST_TIMEOUT", "5")
    yield
    # No cleanup required – monkeypatch restores the original environment.


@pytest.fixture
def mock_responses():
    """
    Activate the ``responses`` library and register mock endpoints for both providers
    and the health check.
    """
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        # NVIDIA mock endpoint
        rsps.add(
            method=responses.POST,
            url="https://api.nvidia.com/v1/completions",
            json=_mock_nvidia_endpoint("{{prompt}}"),
            status=200,
            content_type="application/json",
        )
        # Claude mock endpoint
        rsps.add(
            method=responses.POST,
            url="https://api.anthropic.com/v1/completions",
            json=_mock_claude_endpoint("{{prompt}}"),
            status=200,
            content_type="application/json",
        )
        # Health endpoint mock
        rsps.add(
            method=responses.GET,
            url="http://localhost:3000/api/health",
            json=_mock_health_endpoint(),
            status=200,
            content_type="application/json",
        )
        yield rsps


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #

def test_nvidia_end_to_end(mock_responses):
    """
    Verify that a request routed to the NVIDIA provider returns the expected payload.
    """
    prompt = "Explain the law of gravity."
    service = LLMService()

    try:
        result: CompletionResult = service.get_completion(
            provider=Provider.NVIDIA,
            prompt=prompt,
            max_tokens=64,
            temperature=0.7,
        )
    except Exception as exc:  # pragma: no cover
        pytest.fail(f"Unexpected exception from LLMService: {exc}")

    # Validate the result schema
    assert isinstance(result, CompletionResult)
    assert result.provider == Provider.NVIDIA
    assert prompt in result.text
    assert result.text.startswith("NVIDIA response to:")

    # Ensure the mock endpoint was hit exactly once
    assert len([call for call in mock_responses.calls if "nvidia.com" in call.request.url]) == 1


def test_claude_end_to_end(mock_responses):
    """
    Verify that a request routed to the Claude provider returns the expected payload.
    """
    prompt = "Summarize the plot of 'Hamlet'."
    service = LLMService()

    try:
        result: CompletionResult = service.get_completion(
            provider=Provider.CLAUDE,
            prompt=prompt,
            max_tokens=128,
            temperature=0.5,
        )
    except Exception as exc:  # pragma: no cover
        pytest.fail(f"Unexpected exception from LLMService: {exc}")

    # Validate the result schema
    assert isinstance(result, CompletionResult)
    assert result.provider == Provider.CLAUDE
    assert prompt in result.text
    assert result.text.startswith("Claude response to:")

    # Ensure the mock endpoint was hit exactly once
    assert len([call for call in mock_responses.calls if "anthropic.com" in call.request.url]) == 1


def test_missing_api_key(monkeypatch):
    """
    Ensure the service raises a clear error when a required API key is absent.
    """
    # Remove the NVIDIA key – keep the Claude key to isolate the failure.
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)

    service = LLMService()
    with pytest.raises(ValidationError) as excinfo:
        service.get_completion(
            provider=Provider.NVIDIA,
            prompt="Test prompt",
            max_tokens=16,
            temperature=0.0,
        )
    assert "NVIDIA_API_KEY" in str(excinfo.value)


def test_invalid_provider():
    """
    Verify that an unsupported provider enum raises a ``ValueError``.
    """
    service = LLMService()
    with pytest.raises(ValueError) as excinfo:
        # ``Provider`` is an Enum – passing a raw string should be rejected.
        service.get_completion(
            provider="unknown",  # type: ignore[arg-type]
            prompt="Hello",
            max_tokens=8,
            temperature=0.0,
        )
    assert "Unsupported provider" in str(excinfo.value)


def test_health_endpoint(mock_responses):
    """
    Verify that the health endpoint returns a 200 status with the expected JSON payload.
    """
    service = LLMService()
    # Assuming the service exposes a ``health_check`` method that hits the health URL.
    health = service.health_check()
    assert isinstance(health, dict)
    assert health.get("status") == "ok"
    # Ensure the health mock endpoint was called exactly once.
    assert len([call for call in mock_responses.calls if "/api/health" in call.request.url]) == 1