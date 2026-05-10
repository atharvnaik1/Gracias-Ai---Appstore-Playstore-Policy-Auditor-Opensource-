"""
tests/unit/test_nvidia_client.py

Mock‑based unit tests for the NVIDIA client.

The tests verify:
* Correct request formatting (headers, JSON body) for a completion request.
* Proper error handling for HTTP errors, timeouts and missing API keys.
* That the client raises domain‑specific exceptions with useful messages.

The test suite uses ``pytest`` and the ``responses`` library to mock external
HTTP calls.  Type hints, logging and comprehensive docstrings are provided
to keep the code production‑grade.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict

import pytest
import responses
from pydantic import BaseModel, ValidationError

# Import the client under test – adjust the import path to match the project layout.
# The client is expected to expose a ``completion`` method.
from myapp.clients.nvidia import NvidiaClient, NvidiaError, NvidiaTimeoutError

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Helper models – mirrors the request payload used by the client.
# --------------------------------------------------------------------------- #
class CompletionRequest(BaseModel):
    """Pydantic model for the request body sent to the NVIDIA API."""
    model: str
    prompt: str
    max_tokens: int = 256
    temperature: float = 0.7


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(autouse=True)
def set_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """Ensure the NVIDIA API key is present in the environment for each test."""
    monkeypatch.setenv("NVIDIA_API_KEY", "test-nvidia-key")


@pytest.fixture
def client() -> NvidiaClient:
    """Create a fresh client instance for each test."""
    return NvidiaClient()


# --------------------------------------------------------------------------- #
# Test cases
# --------------------------------------------------------------------------- #
def test_successful_request_formatting(client: NvidiaClient) -> None:
    """
    Verify that the client sends a correctly formatted request.

    The test checks:
    * URL endpoint
    * HTTP method
    * Authorization header
    * JSON payload structure
    """
    request_body = CompletionRequest(
        model="meta/llama-3.1-8b-instruct",
        prompt="Hello, world!",
    )
    expected_url = "https://api.nvidia.com/v1/completions"

    @responses.activate
    def run() -> None:
        responses.add(
            method=responses.POST,
            url=expected_url,
            json={"choices": [{"text": "Hello back!"}]},
            status=200,
        )

        result = client.completion(
            model=request_body.model,
            prompt=request_body.prompt,
            max_tokens=request_body.max_tokens,
            temperature=request_body.temperature,
        )

        # Validate response handling
        assert isinstance(result, dict)
        assert "choices" in result

        # Inspect the request that was sent
        assert len(responses.calls) == 1
        call = responses.calls[0]
        assert call.request.method == "POST"
        assert call.request.url == expected_url

        # Header validation
        auth_header = call.request.headers.get("Authorization")
        assert auth_header == f"Bearer {os.getenv('NVIDIA_API_KEY')}"
        assert call.request.headers.get("Content-Type") == "application/json"

        # Payload validation
        payload: Dict[str, Any] = json.loads(call.request.body.decode())
        assert payload["model"] == request_body.model
        assert payload["prompt"] == request_body.prompt
        assert payload["max_tokens"] == request_body.max_tokens
        assert payload["temperature"] == request_body.temperature

    run()


def test_http_error_handling(client: NvidiaClient) -> None:
    """
    Ensure that HTTP error responses are wrapped in ``NvidiaError`` with a clear
    message containing the status code and response body.
    """
    error_body = {"error": {"message": "Invalid request"}}
    expected_url = "https://api.nvidia.com/v1/completions"

    @responses.activate
    def run() -> None:
        responses.add(
            method=responses.POST,
            url=expected_url,
            json=error_body,
            status=400,
        )

        with pytest.raises(NvidiaError) as exc_info:
            client.completion(
                model="meta/llama-3.1-8b-instruct",
                prompt="Trigger error",
            )

        err_msg = str(exc_info.value)
        assert "400" in err_msg
        assert "Invalid request" in err_msg

    run()


def test_timeout_handling(client: NvidiaClient) -> None:
    """
    Simulate a network timeout and verify that ``NvidiaTimeoutError`` is raised.
    """
    expected_url = "https://api.nvidia.com/v1/completions"

    @responses.activate
    def run() -> None:
        # ``responses`` can raise a ``requests.exceptions.Timeout`` via a callback.
        def request_callback(request):
            raise requests.exceptions.Timeout("Connection timed out")

        responses.add_callback(
            method=responses.POST,
            url=expected_url,
            callback=request_callback,
        )

        with pytest.raises(NvidiaTimeoutError) as exc_info:
            client.completion(
                model="meta/llama-3.1-8b-instruct",
                prompt="Timeout test",
            )

        assert "timed out" in str(exc_info.value).lower()

    run()


def test_missing_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Verify that the client fails fast when the ``NVIDIA_API_KEY`` environment
    variable is absent.
    """
    monkeypatch.delenv("NVIDIA_API_KEY", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        NvidiaClient()  # The client validates the key on init.

    assert "NVIDIA_API_KEY" in str(exc_info.value)


# --------------------------------------------------------------------------- #
# Additional sanity check – ensure the client can be instantiated without
# side effects when the API key is present.
# --------------------------------------------------------------------------- #
def test_client_initialisation_success(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Simple sanity test that the client can be created when the API key is set.
    """
    monkeypatch.setenv("NVIDIA_API_KEY", "dummy-key")
    client = NvidiaClient()
    assert isinstance(client, NvidiaClient)
    assert client.api_key == "dummy-key"