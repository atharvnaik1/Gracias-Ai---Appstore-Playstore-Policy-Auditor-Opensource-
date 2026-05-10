"""Unit tests for configuration loading and validation.

The tests cover:
* Loading API keys from environment variables.
* Validation of required keys.
* Interaction with a .env file.
* Compatibility with both NVIDIA and Anthropic Claude providers.
"""

import os
import logging
from pathlib import Path
from typing import Dict

import pytest
from pytest import MonkeyPatch

# Import the configuration loader from the project.
# It is expected to expose a `load_config` function returning a Pydantic model
# with `nvidia_api_key` and `claude_api_key` attributes.
from app.config import load_config, ConfigError  # type: ignore

LOGGER = logging.getLogger(__name__)


def _set_env(monkeypatch: MonkeyPatch, env: Dict[str, str]) -> None:
    """Helper to set environment variables for a test."""
    for key, value in env.items():
        monkeypatch.setenv(key, value)


@pytest.fixture(name="clear_env")
def fixture_clear_env(monkeypatch: MonkeyPatch) -> None:
    """Ensure no provider keys are present in the environment."""
    for var in ("NVIDIA_API_KEY", "CLAUDE_API_KEY"):
        monkeypatch.delenv(var, raising=False)


def test_load_config_success(monkeypatch: MonkeyPatch) -> None:
    """Configuration loads correctly when both API keys are present."""
    _set_env(
        monkeypatch,
        {
            "NVIDIA_API_KEY": "nv-12345",
            "CLAUDE_API_KEY": "claude-abcde",
        },
    )
    config = load_config()
    assert config.nvidia_api_key == "nv-12345"
    assert config.claude_api_key == "claude-abcde"
    LOGGER.info("Successfully loaded both NVIDIA and Claude API keys.")


def test_missing_nvidia_key(monkeypatch: MonkeyPatch, clear_env: None) -> None:
    """Missing NVIDIA key raises a ConfigError."""
    _set_env(monkeypatch, {"CLAUDE_API_KEY": "claude-abcde"})
    with pytest.raises(ConfigError) as exc_info:
        load_config()
    assert "NVIDIA_API_KEY" in str(exc_info.value)
    LOGGER.debug("Correctly raised ConfigError for missing NVIDIA key.")


def test_missing_claude_key(monkeypatch: MonkeyPatch, clear_env: None) -> None:
    """Missing Claude key raises a ConfigError."""
    _set_env(monkeypatch, {"NVIDIA_API_KEY": "nv-12345"})
    with pytest.raises(ConfigError) as exc_info:
        load_config()
    assert "CLAUDE_API_KEY" in str(exc_info.value)
    LOGGER.debug("Correctly raised ConfigError for missing Claude key.")


def test_load_from_dotenv(monkeypatch: MonkeyPatch, tmp_path: Path) -> None:
    """Configuration can be loaded from a .env file."""
    dotenv_path = tmp_path / ".env"
    dotenv_content = "\n".join(
        [
            "NVIDIA_API_KEY=nv-dotdotenv",
            "CLAUDE_API_KEY=claude-dotenv",
        ]
    )
    dotenv_path.write_text(dotenv_content, encoding="utf-8")

    # Ensure the environment is clean before loading.
    for var in ("NVIDIA_API_KEY", "CLAUDE_API_KEY"):
        monkeypatch.delenv(var, raising=False)

    # Point python-dotenv to the temporary .env file.
    monkeypatch.setenv("DOTENV_PATH", str(dotenv_path))

    # The loader should automatically read the .env file.
    config = load_config()
    assert config.nvidia_api_key == "nv-dotenv"
    assert config.claude_api_key == "claude-dotenv"
    LOGGER.info("Configuration successfully loaded from .env file.")


def test_invalid_key_format(monkeypatch: MonkeyPatch) -> None:
    """Invalid key format should raise a ConfigError."""
    # Example of a malformed key (empty string)
    _set_env(monkeypatch, {"NVIDIA_API_KEY": "", "CLAUDE_API_KEY": "valid-key"})
    with pytest.raises(ConfigError) as exc_info:
        load_config()
    assert "NVIDIA_API_KEY" in str(exc_info.value)
    LOGGER.debug("Detected malformed NVIDIA API key as expected.")


def test_config_is_immutable(monkeypatch: MonkeyPatch) -> None:
    """The returned configuration object should be immutable."""
    _set_env(
        monkeypatch,
        {
            "NVIDIA_API_KEY": "nv-immutable",
            "CLAUDE_API_KEY": "claude-immutable",
        },
    )
    config = load_config()
    with pytest.raises(AttributeError):
        # type: ignore[attr-defined]
        config.nvidia_api_key = "tampered"
    LOGGER.info("Configuration object is immutable as expected.")