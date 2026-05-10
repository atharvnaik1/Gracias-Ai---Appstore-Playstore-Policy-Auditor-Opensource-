"""
tests/unit/test_claude_client.py

Mock‑based unit tests for the Claude client.
These tests verify that request payloads are correctly formatted and that
error handling (HTTP errors, timeouts, and malformed responses) works as
expected.

The client under test is assumed to be ``app.clients.claude.ClaudeClient``.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict

import pytest
import responses
from requests import RequestException, Timeout

# Import the client and its custom exception.
# Adjust the import path according to your project layout.
from app.clients.claude import ClaudeClient, ClaudeAPIError

# --------------------------------------------------------------------------- #
# Constants used across tests
# --------------------------------------------------------------------------- #
BASE_URL = "https://api.anthropic.com/v1/complete"
API_KEY = "test-claude-api-key"

# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="function")
def client() -> ClaudeClient:
    """
    Returns a fresh ``ClaudeClient`` instance with a dummy API key.
    """
    return ClaudeClient(api_key=API_KEY)


@pytest.fixture(scope="function")
def request_payload() -> Dict[str, Any]:
    """
    Example payload used for a successful request.
    """
    return {
        "model": "claude-v1",
        "prompt": "Hello, world!",
        "max_tokens_to 50,
        "temperature": 0.7,
        "top_p": 0.9,
    }


# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #
def _mock_successful_response(body: Dict[str, Any]) -> None:
    """
    Register a successful ``responses`` mock for the Claude endpoint.
    """
    responses.add(
        method=responses.POST,
        url=BASE_URL,
        json=body,
        status=200,
        content_type="application/json",
    )


def _mock_error_response(status: int, error_body: Dict[str, Any]) -> None:
    """
    Register an error ``responses`` mock for the Claude endpoint.
    """
    responses.add(
        method=responses.POST,
        url=BASE_URL,
        json=error_body,
        status=status,
        content_type="application/json",
    )


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #
@responses.activate
def test_successful_request_formats_payload_correctly(
    client: ClaudeClient,
    request_payload: Dict[str, Any],
) -> None:
    """
    Verify that the client sends a correctly formatted JSON body and that the
    response is parsed without errors.
    """
    mock_response = {
        "id": "completion-123",
        "completion": "Hello, Claude!",
        "stop_reason": "max_tokens",
        "model": request_payload["model"],
    }
    _mock_successful_response(mock_response)

    result = client.complete(**request_payload)

    # Ensure the request payload matches what the client sent.
    sent_body = json.loads(responses.calls[0].request.body.decode())
    assert sent_body == request_payload

    # Validate the parsed response.
    assert result.id == mock_response["id"]
    assert result.completion == mock_response["completion"]
    assert result.stop_reason == mock_response["stop_reason"]
    assert result.model == mock_response["model"]


@responses.activate
def test_http_error_raises_claude_api_error(
    client: ClaudeClient,
    request_payload: Dict[str, Any],
) -> None:
    """
    The client should raise ``ClaudeAPIError`` when the remote service returns a
    non‑2xx HTTP status.
    """
    error_body = {"error": {"type": "invalid_request_error", "message": "Bad request"}}
    _mock_error_response(status=400, error_body=error_body)

    with pytest.raises(ClaudeAPIError) as exc_info:
        client.complete(**request_payload)

    # The exception should contain the original HTTP status and error message.
    assert exc_info.value.status_code == 400
    assert "Bad request" in str(exc_info.value)


@responses.activate
def test_timeout_raises_timeout_exception(
    client: ClaudeClient,
    request_payload: Dict[str, Any],
) -> None:
    """
    Simulate a network timeout and verify that the client surfaces a
    ``Timeout`` (or a wrapped ``ClaudeAPIError``) to the caller.
    """
    def request_callback(request):
        raise Timeout("The request timed out")

    responses.add_callback(
        method=responses.POST,
        url=BASE_URL,
        callback=request_callback,
    )

    with pytest.raises(Timeout):
        client.complete(**request_payload)


@responses.activate
def test_malformed_json_response_raises_claude_api_error(
    client: ClaudeClient,
    request_payload: Dict[str, Any],
) -> None:
    """
    When the provider returns an invalid JSON payload, the client should raise
    ``ClaudeAPIError`` indicating a parsing failure.
    """
    responses.add(
        method=responses.POST,
        url=BASE_URL,
        body="not-a-json",
        status=200,
        content_type="application/json",
    )

    with pytest.raises(ClaudeAPIError) as exc_info:
        client.complete(**request_payload)

    assert "JSONDecodeError" in str(exc_info.value)


# --------------------------------------------------------------------------- #
# Logging sanity check (optional)
# --------------------------------------------------------------------------- #
def test_logging_is_configured(caplog: pytest.LogCaptureFixture) -> None:
    """
    Ensure that the ``ClaudeClient`` emits a DEBUG log when a request is made.
    """
    client = ClaudeClient(api_key=API_KEY)
    with responses.activate:
        _mock_successful_response(
            {
                "id": "completion-123",
                "completion": "Hello",
                "stop_reason": "max_tokens",
                "model": "claude-v1",
            }
        )
        with caplog.at_level(logging.DEBUG):
            client.complete(model="claude-v1", prompt="test", max_tokens=5)

    # Verify that at least one DEBUG message from the client appears.
    debug_messages = [rec.message for rec in caplog.records if rec.levelno == logging.DEBUG]
    assert any("Sending request to Claude API" in msg for msg in debug_messages)