# ------------------------------------------------------------
# Multi‑stage Dockerfile for the FastAPI micro‑service
# ------------------------------------------------------------
# Build stage – install build tools and Python dependencies
# ------------------------------------------------------------
FROM python:3.11-slim AS builder

# ---- Install system build dependencies (if any) ----
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# ---- Create a non‑root user ----
ARG UID=10001
ARG GID=10001
RUN groupadd --gid ${GID} appgroup && \
    useradd --uid ${UID} --gid ${GID} --shell /sbin/nologin --create-home appuser

# ---- Set working directory ----
WORKDIR /app

# ---- Copy and install Python dependencies ----
# (We use a requirements.txt file for reproducibility)
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ------------------------------------------------------------
# Runtime stage – minimal image with only runtime requirements
# ------------------------------------------------------------
FROM python:3.11-slim AS runtime

# ---- Create the same non‑root user as in builder ----
ARG UID=10001
ARG GID=10001
RUN groupadd --gid ${GID} appgroup && \
    useradd --uid ${UID} --gid ${GID} --shell /sbin/nologin --create-home appuser

# ---- Set environment variables ----
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV APP_HOME=/app
ENV PORT=8000

# ---- Install runtime dependencies only (no build tools) ----
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# ---- Create work directory and set permissions ----
WORKDIR ${APP_HOME}
RUN chown appuser:appgroup ${APP_HOME}

# ---- Copy application source code ----
COPY . ${APP_HOME}

# ---- Expose the HTTP port used by Uvicorn ----
EXPOSE ${PORT}

# ---- Switch to non‑root user ----
USER appuser

# ---- Entrypoint: run the FastAPI server ----
# The command uses the environment variables for API keys.
# They can be provided at runtime via `docker run -e` or a .env file.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]