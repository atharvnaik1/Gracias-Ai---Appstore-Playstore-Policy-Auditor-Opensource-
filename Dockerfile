dockerfile
# ============================================================
# Multi-stage Dockerfile for the FastAPI micro‑service
# ============================================================
#
# Build stage – install build tools and Python dependencies
# ============================================================
FROM python:3.11-slim AS builder

# ----- Validate build arguments -------------------------------------------
ARG UID=10001
ARG GID=10001
RUN test "$UID" -gt 0 2>/dev/null && test "$GID" -gt 0 2>/dev/null || \
    { echo "ERROR: UID and GID must be positive integers" >&2; exit 1; }

# ----- Install system build dependencies (if any) -------------------------
# Keep dependencies minimal; clean up apt cache to reduce image size
RUN export DEBIAN_FRONTEND=noninteractive && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev && \
    rm -rf /var/lib/apt/lists/* && \
    echo "[INFO] Build dependencies installed"

# ----- Create a non‑root user ---------------------------------------------
RUN groupadd --gid ${GID} appgroup && \
    useradd --uid ${UID} --gid ${GID} --shell /sbin/nologin --create-home appuser && \
    echo "[INFO] Non‑root user created (UID:${UID}, GID:${GID})"

# ----- Set working directory ----------------------------------------------
WORKDIR /app

# ----- Copy and install Python dependencies --------------------------------
# Fail early if requirements.txt is missing
COPY requirements.txt .
RUN test -f requirements.txt || { echo "ERROR: requirements.txt not found" >&2; exit 1; } && \
    pip install --upgrade pip --quiet && \
    pip install --no-cache-dir --quiet -r requirements.txt && \
    echo "[INFO] Python dependencies installed"

# ============================================================
# Runtime stage – minimal image with only runtime requirements
# ============================================================
FROM python:3.11-slim AS runtime

# ----- Validate build arguments (repeated for consistency) -----------------
ARG UID=10001
ARG GID=10001
RUN test "$UID" -gt 0 2>/dev/null && test "$GID" -gt 0 2>/dev/null || \
    { echo "ERROR: UID and GID must be positive integers" >&2; exit 1; }

# ----- Create the same non‑root user as in builder -------------------------
RUN groupadd --gid ${GID} appgroup && \
    useradd --uid ${UID} --gid ${GID} --shell /sbin/nologin --create-home appuser

# ----- Set environment variables -------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_HOME=/app \
    PORT=8000

# ----- Copy Python and runtime binaries from builder -----------------------
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# ----- Create work directory and set proper ownership ----------------------
WORKDIR ${APP_HOME}
RUN chown appuser:appgroup ${APP_HOME} && \
    echo "[INFO] Work directory set and permissions applied"

# ----- Copy application source code ----------------------------------------
COPY --chown=appuser:appgroup . ${APP_HOME}

# ----- Expose the HTTP port used by Uvicorn --------------------------------
EXPOSE ${PORT}

# ----- Health check ---------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')" || exit 1

# ----- Switch to non‑root user ---------------------------------------------
USER appuser

# ----- Entrypoint: run the FastAPI server ----------------------------------
# The command uses environment variables for configuration.
# They can be provided at runtime via `docker run -e` or a .env file.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
