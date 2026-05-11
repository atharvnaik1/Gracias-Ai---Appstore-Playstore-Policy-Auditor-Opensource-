python
# tests/integration/test_end_to_end.py
"""
Integration tests for the unified LLM service.

The tests spin up mock HTTP endpoints for the two supported providers
(NVIDIA and Anthropic Claude) and verify that the service correctly
routes requests, handles API keys, and returns the expected
completion payloads. They also verify health and upload endpoints.
"""

import os
import json
import logging
import time
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


def _mock_nvidia_endpoint(request):
    """Return a deterministic mock response for the NVIDIA provider."""
    payload = json.loads(request.body)
    prompt = payload.get("prompt", "")
    return (
        200,
        {"Content-Type": "application/json"},
        json.dumps(
            {
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
        ),
    )


def _mock_claude_endpoint(request):
    """Return a deterministic mock response for the Claude provider."""
    payload = json.loads(request.body)
    prompt = payload.get("prompt", "")
    return (
        200,
        {"Content-Type": "application/json"},
        json.dumps(
            {
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
        ),
    )


def _mock_health_endpoint(request):
    """Mock health endpoint payload – new format."""
    return (
        200,
        {"Content-Type": "application/json"},
        json.dumps({"status": "ok", "checks": {}}),
    )


def _mock_upload_endpoint(request):
    """Mock upload endpoint payload."""
    return (
        200,
        {"Content-Type": "application/json"},
        json.dumps(
            {"status": "uploaded", "message": "File uploaded successfully"}
        ),
    )


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
    # Vercel deployment URL – use the actual Vercel preview URL
    monkeypatch.setenv(
        "VERCEL_URL",
        "https://gracias-aistorepolicy-auditor-opensource.vercel.app",
    )
    monkeypatch.setenv("VERCEL_ENV", "development")
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "dummysha123456")
    # Timeout configuration (seconds)
    monkeypatch.setenv("REQUEST_TIMEOUT", "5")
    # Wait for the mock server (Vercel preview) to become ready
    service = LLMService()
    timeout = time.time() + 30  # 30‑second timeout
    while time.time() < timeout:
        try:
            health = service.health_check()
            if health.get("status") == "ok":
                break
        except Exception:
            pass
        time.sleep(1)
    else:
        pytest.fail("Server did not become ready within the timeout period")
    yield
    # No cleanup required – monkeypatch restores the original environment.


@pytest.fixture
def mock_responses():
    """
    Activate the ``responses`` library and register mock endpoints for both providers
    and the health and upload checks.
    """
    with responses.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        # NVIDIA mock endpoint
        rsps.add_callback(
            method=responses.POST,
            url="https://api.nvidia.com/v1/completions",
            callback=_mock_nvidia_endpoint,
            content_type="application/json",
        )
        # Claude mock endpoint
        rsps.add_callback(
            method=responses.POST,
            url="https://api.anthropic.com/v1/completions",
            callback=_mock_claude_endpoint,
            content_type="application/json",
        )
        # Health endpoint mock (new response format)
        rsps.add_callback(
            method=responses.GET,
            url="https://gracias-aistorepolicy-auditor-opensource.vercel.app/api/health",
            callback=_mock_health_endpoint,
            content_type="application/json",
        )
        # Upload endpoint mock
        rsps.add_callback(
            method=responses.POST,
            url="https://gracias-aistorepolicy-auditor-opensource.vercel.app/api/upload",
            callback=_mock_upload_endpoint,
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
    assert len([c for c in mock_responses.calls if "api.nvidia.com" in c.request.url]) == 1


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
    assert len([c for c in mock_responses.calls if "api.anthropic.com" in c.request.url]) == 1


def test_missing_api_key(monkeypatch):
    """
    Verify that the service raises an informative error when the required
    API key for a provider is missing.
    """
    # Remove NVIDIA key
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)
    service = LLMService()
    with pytest.raises(RuntimeError) as excinfo:
        service.get_completion(
            provider=Provider.NVIDIA,
            prompt="Test prompt",
            max_tokens=10,
            temperature=0.0,
        )
    assert "NVIDIA_API_KEY" in str(excinfo.value)


def test_health_endpoint(mock_responses):
    """
    Verify that the health endpoint returns the expected status payload.
    """
    service = LLMService()
    health = service.health_check()
    assert isinstance(health, dict)
    assert health.get("status") == "ok"
    assert "checks" in health


def test_upload_endpoint(mock_responses):
    """
    Verify that the upload endpoint returns a successful response.
    """
    service = LLMService()
    # Assuming the service exposes an ``upload_file`` method that returns the parsed JSON.
    result = service.upload_file(b"dummy content", filename="test.txt")
    assert isinstance(result, dict)
    assert result.get("status") == "uploaded"
    assert result.get("message") == "File uploaded successfully"