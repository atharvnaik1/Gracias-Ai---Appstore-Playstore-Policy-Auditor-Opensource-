python
# ------------------------------------------------------------
# Vercel Deployment Authorization & Process Documentation
# ------------------------------------------------------------
# This project is deployed to Vercel under the
# "atharvnaik1's projects" team.
#
# 1. Authorization
#    A team member must authorize the GitHub integration before
#    any deployment. Visit the following URL (replace placeholders
#    if necessary) to grant the required permissions:
#
#    https://vercel.com/git/authorize?team=atharvnaik1%27s%20projects&slug=atharvnaik1s-projects&teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&type=github&job=%7B%22headInfo%22%3A%7B%22sha%22%3A%225404aa6b82d178cb7f53c8bb6d252962038819d1%22%7D%2C%22id%22%3A%22Qmema1agMRtSB3nfshejPmmAWBrYNK6zKicZTJuG9QTP1e%22%2C%22org%22%3A%22atharvnaik1%22%2C%22prId%22%3A103%2C%22repo%22%3A%22ipaship-app-reviewer%22%7D
#
# 2. Required Environment Variables
#    - VERCEL_TEAM_ID: The Vercel team identifier (e.g., team_c0hqDrZckNBm5AkYTYHVKoE8)
#    - VERCEL_PROJECT_ID: The Vercel project identifier (optional, if using the Vercel CLI)
#    - Additional project‑specific variables (API keys, endpoints, etc.) must be set
#      in a .env file or the deployment environment.
#
# 3. Deployment Steps
#    a. Ensure the repository is authorized (step 1).
#    b. Verify that all required environment variables are present.
#    c. Run the Vercel CLI to deploy:
#          vercel --prod --confirm
#       or trigger a deployment via the Vercel dashboard.
#    d. Monitor the deployment status on Vercel; any missing
#       authorization or env vars will cause the deployment to fail.
#
# Contributors should verify authorization and env vars before
# executing any deployment scripts.
# ------------------------------------------------------------

import os
import logging
from typing import Literal, Optional

from pydantic import BaseSettings, Field, validator
from dotenv import load_dotenv

load_dotenv()  # Load .env file if present

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Core API keys
    nvidia_api_key: str = Field(..., env="NVIDIA_API_KEY")
    claude_api_key: str = Field(..., env="CLAUDE_API_KEY")

    # API endpoints
    nvidia_endpoint: str = Field(
        "https://api.nvidia.com/v1/completions", env="NVIDIA_ENDPOINT"
    )
    claude_endpoint: str = Field(
        "https://api.anthropic.com/v1/complete", env="CLAUDE_ENDPOINT"
    )

    # Request configuration
    request_timeout: int = Field(30, env="REQUEST_TIMEOUT")
    max_retries: int = Field(3, env="MAX_RETRIES")
    provider_default: Literal["nvidia", "claude"] = Field(
        "nvidia", env="PROVIDER_DEFAULT"
    )

    # Vercel deployment configuration
    vercel_team_id: str = Field(..., env="VERCEL_TEAM_ID")
    vercel_project_id: Optional[str] = Field(None, env="VERCEL_PROJECT_ID")

    @validator("nvidia_api_key", "claude_api_key", "vercel_team_id")
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Value cannot be empty")
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