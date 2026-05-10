# file: llm_wrapper/config.py
import os
import logging
from typing import Literal, Optional

from pydantic import BaseSettings, Field, validator
from dotenv import load_dotenv

load_dotenv()  # Load .env file if present

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    nvidia_api_key: str = Field(..., env="NVIDIA_API_KEY")
    claude_api_key: str = Field(..., env="CLAUDE_API_KEY")
    nvidia_endpoint: str = Field(
        "https://api.nvidia.com/v1/completions", env="NVIDIA_ENDPOINT"
    )
    claude_endpoint: str = Field(
        "https://api.anthropic.com/v1/complete", env="CLAUDE_ENDPOINT"
    )
    request_timeout: int = Field(30, env="REQUEST_TIMEOUT")
    max_retries: int = Field(3, env="MAX_RETRIES")
    provider_default: Literal["nvidia", "claude"] = Field(
        "nvidia", env="PROVIDER_DEFAULT"
    )

    @validator("nvidia_api_key", "claude_api_key")
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("API key cannot be empty")
        return v

    class Config:
        env_file = ".env"
        case_sensitive = False


def get_settings() -> Settings:
    """Singleton accessor for Settings."""
    if not hasattr(get_settings, "_cached"):
        try:
            get_settings._cached = Settings()
            logger.info("Configuration loaded successfully")
        except Exception as exc:
            logger.exception("Failed to load configuration")
            raise
    return get_settings._cached  # type: ignore