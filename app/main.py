# app/main.py
"""
FastAPI entry point for the LLM micro‑service.

- Reads configuration and secrets from environment variables (or a .env file).
- Exposes a unified ``/generate`` endpoint that forwards the request to either
  the NVIDIA or Anthropic (Claude) API based on a ``provider`` flag.
- Implements basic in‑memory rate‑limiting per client IP.
- Provides detailed logging, error handling and type‑hints.
"""

import os
import logging
from typing import Literal, Optional, Dict, Any

import httpx
from fastapi import FastAPI, Request, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError
from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
# Load environment variables (supports a .env file in the project root)
# --------------------------------------------------------------------------- #
load_dotenv()  # noqa: D400

# --------------------------------------------------------------------------- #
# Logging configuration
# --------------------------------------------------------------------------- #
LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger("llm_service")

# --------------------------------------------------------------------------- #
# Constants & configuration
# --------------------------------------------------------------------------- #
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
if not NVIDIA_API_KEY:
    logger.warning("NVIDIA_API_KEY not set – NVIDIA provider will be unavailable.")
if not CLAUDE_API_KEY:
    logger.warning("CLAUDE_API_KEY not set – Claude provider will be unavailable.")

# --------------------------------------------------------------------------- #
# Rate limiting (simple token‑bucket implementation)
# --------------------------------------------------------------------------- #
RATE_LIMIT = 60  # requests per minute per IP
_RATE_LIMIT_STATE: Dict[str, Dict[str, Any]] = {}

def _rate_limiter(request: Request) -> None:
    """Raise HTTPException if the client exceeded the rate limit."""
    client_ip = request.client.host
    bucket = _RATE_LIMIT_STATE.setdefault(
        client_ip,
        {"tokens": RATE_LIMIT, "last_refill": request.state.time},
    )
    # Refill tokens based on elapsed seconds
    elapsed = request.state.time - bucket["last_refill"]
    refill = int(elapsed * (RATE_LIMIT / 60))
    if refill > 0:
        bucket["tokens"] = min(RATE_LIMIT, bucket["tokens"] + refill)
        bucket["last_refill"] = request.state.time

    if bucket["tokens"] <= 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later.",
        )
    bucket["tokens"] -= 1

# --------------------------------------------------------------------------- #
# Request / response models
# --------------------------------------------------------------------------- #
class GenerateRequest(BaseModel):
    """Payload for a generation request."""
    prompt: str = Field(..., min_length=1, description="User prompt")
    provider: Literal["nvidia", "claude"] | None = Field(
        None,
        description="Explicit provider; if omitted the service selects based on availability",
    )
    max_tokens: int | None = Field(
        256,
        ge=1,
        le=2048,
        description="Maximum number of tokens to generate",
    )

class GenerateResponse(BaseModel):
    """Standardised response from the LLM service."""
    provider: Literal["nvidia", "claude"]
    completion: str
    usage: Dict[str, Any] | None = None

# --------------------------------------------------------------------------- #
# Unified client
# --------------------------------------------------------------------------- #
class LLMClient:
    """Thin wrapper that routes calls to the selected LLM provider."""

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=30.0)

    async def _call_nvidia(self, prompt: str, max_tokens: int) -> Dict[str, Any]:
        endpoint = "https://api.nvidia.com/v1/generate"
        headers = {"Authorization": f"Bearer {NVIDIA_API_KEY}"}
        payload = {"prompt": prompt, "max_tokens": max_tokens}
        logger.debug("Calling NVIDIA endpoint %s", endpoint)
        response = await self._http.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()

    async def _call_claude(self, prompt: str, max_tokens: int) -> Dict[str, Any]:
        endpoint = "https://api.anthropic.com/v1/complete"
        headers = {
            "x-api-key": CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": "claude-3-5-sonnet-20240620",
            "prompt": f"\n\nHuman: {prompt}\n\nAssistant:",
            "max_tokens_to_sample": max_tokens,
        }
        logger.debug("Calling Claude endpoint %s", endpoint)
        response = await self._http.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()

    async def generate(
        self,
        prompt: str,
        provider: Literal["nvidia", "claude"] | None = None,
        max_tokens: int = 256,
    ) -> GenerateResponse:
        """
        Generate a completion using the configured provider.

        Args:
            prompt: Input text for the LLM.
            provider: Explicit provider name; if ``None`` the client picks the first
                available provider based on configured API keys.
            max_tokens: Upper bound for generated tokens.

        Returns:
            ``GenerateResponse`` containing the provider used and the raw completion.

        Raises:
            HTTPException: If no provider is available or the upstream call fails.
        """
        # Resolve provider
        if provider is None:
            if NVIDIA_API_KEY:
                provider = "nvidia"
            elif CLAUDE_API_KEY:
                provider = "claude"
            else:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="No LLM provider configured.",
                )
        elif provider == "nvidia" and not NVIDIA_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="NVIDIA API key missing.",
            )
        elif provider == "claude" and not CLAUDE_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Claude API key missing.",
            )

        try:
            if provider == "nvidia":
                raw = await self._call_nvidia(prompt, max_tokens)
                completion = raw.get("choices", [{}])[0].get("text", "")
                usage = raw.get("usage")
            else:
                raw = await self._call_claude(prompt, max_tokens)
                completion = raw.get("completion", "")
                usage = {"model": raw.get("model")}
        except httpx.HTTPStatusError as exc:
            logger.error(
                "Provider %s returned %s – %s", provider, exc.response.status_code, exc
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{provider.title()} service error: {exc.response.text}",
            ) from exc
        except httpx.RequestError as exc:
            logger.error("Network error contacting %s – %s", provider, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Network error contacting {provider.title()}: {exc}",
            ) from exc

        return GenerateResponse(provider=provider, completion=completion, usage=usage)

# --------------------------------------------------------------------------- #
# FastAPI application setup
# --------------------------------------------------------------------------- #
app = FastAPI(
    title="LLM Micro‑service",
    description="Unified wrapper around NVIDIA and Anthropic (Claude) LLM APIs.",
    version="1.0.0",
)

client = LLMClient()

# --------------------------------------------------------------------------- #
# Middleware – inject request timestamp for rate‑limiting
# --------------------------------------------------------------------------- #
@app.middleware("http")
async def add_timestamp(request: Request, call_next):
    request.state.time = httpx.time.time()
    return await call_next(request)

# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/health", tags=["Health"])
async def health() -> JSONResponse:
    """Simple health‑check endpoint."""
    return JSONResponse(content={"status": "ok"})


@app.post(
    "/generate",
    response_model=GenerateResponse,
    tags=["Generation"],
    responses={
        400: {"description": "Invalid request payload"},
        429: {"description": "Rate limit exceeded"},
        502: {"description": "Upstream provider error"},
        503: {"description": "No provider configured"},
    },
)
async def generate_endpoint(
    payload: GenerateRequest,
    request: Request,
    _: None = Depends(_rate_limiter),
) -> GenerateResponse:
    """
    Forward a prompt to the selected LLM provider.

    The endpoint validates the request, applies rate‑limiting,
    and returns the generated text together with provider metadata.
    """
    logger.info(
        "Received generation request – provider=%s, prompt_len=%d",
        payload.provider or "auto",
        len(payload.prompt),
    )
    try:
        response = await client.generate(
            prompt=payload.prompt,
            provider=payload.provider,
            max_tokens=payload.max_tokens,
        )
        logger.info("Generated %d characters using %s", len(response.completion), response.provider)
        return response
    except ValidationError as exc:
        logger.warning("Request validation error – %s", exc)
        raise HTTPException(status_code=400, detail=exc.errors()) from exc


# --------------------------------------------------------------------------- #
# Application entry point (uvicorn)
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8000")),
        log_level="info",
        reload=False,
    )