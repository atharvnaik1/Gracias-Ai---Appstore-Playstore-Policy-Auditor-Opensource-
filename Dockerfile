# syntax=docker/dockerfile:1.4

############################
# Build stage
############################
FROM python:3.11-slim AS builder

# Install build‑time dependencies (gcc, libpq-dev, etc.) for any compiled wheels
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

# Set a deterministic working directory
WORKDIR /app

# Install Python dependencies in a clean environment
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

############################
# Runtime stage
############################
FROM python:3.11-slim

# Create a non‑root user for security
RUN groupadd --gid 1000 appgroup && \
    useradd --uid 1000 --gid 1000 --shell /usr/sbin/nologin --create-home appuser

# Copy only the compiled packages from the builder stage
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Set the working directory for the runtime image
WORKDIR /app

# Copy application source code (excluding files matched by .dockerignore)
COPY . .

# Switch to the non‑root user
USER appuser

# Runtime environment variables – values are injected at container start‑up
ENV NVIDIA_API_KEY=${NVIDIA_API_KEY}
ENV ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# Expose the HTTP port used by the service (adjust if needed)
EXPOSE 8000

# Simple health‑check endpoint (adjust path if your app uses a different one)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command – replace `myapp.main` with your actual entry module
CMD ["python", "-m", "myapp.main"]