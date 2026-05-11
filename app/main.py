python
import os
import logging
from typing import Optional, Literal

import httpx
import uvicorn
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ValidationError

# --------------------------------------------------------------------------- #
# Configuration / Constants
# --------------------------------------------------------------------------- #
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# FastAPI app initialization
# --------------------------------------------------------------------------- #
app = FastAPI(title="LLM Generation Service")

# --------------------------------------------------------------------------- #
# Pydantic models
# --------------------------------------------------------------------------- #
class GenerateRequest(BaseModel):
    prompt: str
    provider: Optional[Literal["nvidia", "claude"]] = None
    max_tokens: int = 256


class GenerateResponse(BaseModel):
    provider: str
    completion: str
    usage: Optional[dict] = None


# --------------------------------------------------------------------------- #
# LLM client implementation
# --------------------------------------------------------------------------- #
class LLMClient:
    def __init__(self, http_client: httpx.AsyncClient):
        self._http = http_client

    async def _call_nvidia(self, prompt: str, max_tokens: int):
        endpoint = "https://api.nvidia.com/v1/generate"
        payload = {
            "prompt": f"\nHuman: {prompt}\n\nAssistant:",
            "max_tokens_to_sample": max_tokens,
        }
        logger.debug("Calling NVIDIA endpoint %s", endpoint)
        response = await self._http.post(endpoint, json=payload)
        response.raise_for_status()
        return response.json()

    async def _call_claude(self, prompt: str, max_tokens: int):
        endpoint = "https://api.anthropic.com/v1/complete"
        payload = {
            "prompt": f"\nHuman: {prompt}\n\nAssistant:",
            "max_tokens_to_sample": max_tokens,
        }
        logger.debug("Calling Claude endpoint %s", endpoint)
        response = await self._http.post(endpoint, json=payload)
        response.raise_for_status()
        return response.json()

    async def generate(
        self,
        prompt: str,
        provider: Optional[Literal["nvidia", "claude"]] = None,
        max_tokens: int = 256,
    ) -> GenerateResponse:
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
                "Provider %s returned %s – %s",
                provider,
                exc.response.status_code,
                exc,
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
# Dependency injection
# --------------------------------------------------------------------------- #
def get_llm_client(request: Request) -> LLMClient:
    """Provide a shared LLMClient instance."""
    return LLMClient(http_client=request.app.state.http_client)  # type: ignore[attr-defined]


# --------------------------------------------------------------------------- #
# API endpoint
# --------------------------------------------------------------------------- #
@app.post(
    "/generate",
    response_model=GenerateResponse,
    responses={
        429: {"description": "Rate limit exceeded"},
        503: {"description": "No provider configured"},
        502: {"description": "Upstream service error"},
    },
)
async def generate(
    payload: GenerateRequest,
    request: Request,
    _: None = Depends(_rate_limiter),
    client: LLMClient = Depends(get_llm_client),
) -> JSONResponse:
    """
    Generate a completion from the selected LLM provider.

    The request is first validated by Pydantic, then the client
    performs rate‑limiting before delegating to the LLM provider.
    """
    logger.info(
        "Received generation request – provider=%s, max_tokens=%s, ip=%s",
        payload.provider or "auto",
        payload.max_tokens,
        request.client.host,
    )
    response = await client.generate(
        prompt=payload.prompt,
        provider=payload.provider,
        max_tokens=payload.max_tokens,
    )
    logger.info("Generated response using %s", response.provider)
    return JSONResponse(content=response.dict())


# --------------------------------------------------------------------------- #
# Global exception handlers
# --------------------------------------------------------------------------- #
@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError) -> JSONResponse:
    """Return a clean JSON error for Pydantic validation failures."""
    logger.warning("Validation error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors()},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Standardise HTTPException responses."""
    logger.warning(
        "HTTPException %s at %s – %s", exc.status_code, request.url.path, exc.detail
    )
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# --------------------------------------------------------------------------- #
# Application startup / shutdown events
# --------------------------------------------------------------------------- #
@app.on_event("startup")
async def startup_event():
    app.state.http_client = httpx.AsyncClient()


@app.on_event("shutdown")
async def shutdown_event():
    await app.state.http_client.aclose()


# --------------------------------------------------------------------------- #
# Run the FastAPI application
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)