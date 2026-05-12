# app/routes.py
"""
FastAPI route definitions for the LLM micro‑service.

Endpoints
---------
POST /generate
    Accepts a JSON payload with a `prompt` and an optional `provider`
    (either "nvidia" or "claude"). Returns the generated text from the
    selected provider.

The module loads required secrets from environment variables (or a
`.env` file) and forwards requests to the unified `api_client` which
handles provider selection and HTTP communication.
"""

import os
import logging
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, ValidationError
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

# Import the unified client – assumed to be implemented elsewhere in the project
from api_client import generate as generate_text  # noqa: F401

router = APIRouter()
log = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Pydantic models
# --------------------------------------------------------------------------- #
class GenerateRequest(BaseModel):
    """Request payload for the `/generate` endpoint."""
    prompt: str = Field(..., description="The user prompt to be sent to the LLM.")
    provider: Optional[Literal["nvidia", "claude"]] = Field(
        None,
        description="Explicit provider to use. If omitted, the client selects based on config.",
    )


class GenerateResponse(BaseModel):
    """Response payload for the `/generate` endpoint."""
    provider: Literal["nvidia", "claude"]
    output: str = Field(..., description="Generated text from the LLM.")


# --------------------------------------------------------------------------- #
# Helper functions
# --------------------------------------------------------------------------- #
def _validate_api_keys() -> None:
    """
    Ensure that at least one of the required API keys is available.

    Raises
    ------
    HTTPException
        If neither NVIDIA nor Claude API keys are set.
    """
    nvidia_key = os.getenv("NVIDIA_API_KEY")
    claude_key = os.getenv("CLAUDE_API_KEY")
    if not nvidia_key and not claude_key:
        log.error("Missing both NVIDIA_API_KEY and CLAUDE_API_KEY")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: no LLM API keys found.",
        )


# --------------------------------------------------------------------------- #
# Route definitions
# --------------------------------------------------------------------------- #
@router.post(
    "/generate",
    response_model=GenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate text using an LLM provider",
)
async def generate_endpoint(request: GenerateRequest) -> GenerateResponse:
    """
    Forward a generation request to the selected LLM provider.

    Parameters
    ----------
    request: GenerateRequest
        The incoming JSON payload containing the prompt and optional provider.

    Returns
    -------
    GenerateResponse
        JSON containing the provider used and the generated output.

    Raises
    ------
    HTTPException
        For validation errors, missing API keys, or provider‑specific failures.
    """
    log.info(
        "Received generation request – provider=%s",
        request.provider or "auto",
    )

    # Validate that required secrets are present before proceeding
    _validate_api_keys()

    try:
        # The unified client decides which provider to call based on the request
        output, used_provider = await generate_text(
            prompt=request.prompt,
            provider=request.provider,
        )
    except ValidationError as ve:
        log.warning("Payload validation error: %s", ve)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except RuntimeError as re:
        # Expected from api_client when a provider cannot be used
        log.error("Provider error: %s", re)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(re),
        )
    except Exception as exc:
        # Catch‑all for unexpected failures
        log.exception("Unexpected error during generation")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred.",
        ) from exc

    log.info("Generated response using %s", used_provider)
    return GenerateResponse(provider=used_provider, output=output)