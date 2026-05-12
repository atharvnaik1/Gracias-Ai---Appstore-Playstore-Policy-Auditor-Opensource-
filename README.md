python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Setup and deployment helper for the llm-microservice project.

Features
--------
* **Prerequisites** – checks for Python, Docker and Vercel CLI.
* **Docker workflow** – build and run the container locally.
* **Vercel deployment guide** – step‑by‑step instructions and
  quick‑start commands.
"""

import argparse
import logging
import os
import subprocess
import sys
from pathlib import Path

# --------------------------------------------------------------------------- #
# Logging configuration
# --------------------------------------------------------------------------- #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
LOGGER = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #
PROJECT_ROOT = Path(__file__).resolve().parent
VERCEL_AUTH_URL = (
    "https://vercel.com/git/authorize?"
    "team=atharvnaik1%20projects&"
    "slug=atharvnaik1s-projects&"
    "teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&"
    "type=github"
)

# --------------------------------------------------------------------------- #
# Helper utilities
# --------------------------------------------------------------------------- #
def _run_cmd(command: list[str], cwd: Path | None = None) -> None:
    """Execute a shell command, raising on failure."""
    LOGGER.debug("Running command: %s", " ".join(command))
    result = subprocess.run(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    LOGGER.info(result.stdout)
    if result.returncode != 0:
        raise RuntimeError(f"Command {' '.join(command)} failed with code {result.returncode}")


def _check_executable(name: str) -> bool:
    """Return True if *name* is available on PATH."""
    return subprocess.run(["which", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


# --------------------------------------------------------------------------- #
# Prerequisite checks
# --------------------------------------------------------------------------- #
def check_prerequisites() -> None:
    """Validate that required tools are installed."""
    missing = []
    for tool in ("python3", "docker", "vercel"):
        if not _check_executable(tool):
            missing.append(tool)
    if missing:
        raise EnvironmentError(
            f"The following required tools are missing or not on PATH: {', '.join(missing)}"
        )
    LOGGER.info("All required tools are present.")


# --------------------------------------------------------------------------- #
# Docker workflow
# --------------------------------------------------------------------------- #
DOCKER_IMAGE_TAG = "llm-microservice:latest"


def docker_build() -> None:
    """Build the Docker image for the project."""
    check_prerequisites()
    dockerfile = PROJECT_ROOT / "Dockerfile"
    if not dockerfile.is_file():
        raise FileNotFoundError("Dockerfile not found in project root.")
    _run_cmd(
        ["docker", "build", "-t", DOCKER_IMAGE_TAG, "."],
        cwd=PROJECT_ROOT,
    )
    LOGGER.info("Docker image built as %s.", DOCKER_IMAGE_TAG)


def docker_run(detach: bool = False, port: int = 8000) -> None:
    """Run the Docker container locally."""
    check_prerequisites()
    run_cmd = [
        "docker",
        "run",
        "--rm",
        "-p",
        f"{port}:8000",
        "-e",
        "PYTHONUNBUFFERED=1",
    ]
    if detach:
        run_cmd.append("-d")
    run_cmd.append(DOCKER_IMAGE_TAG)
    _run_cmd(run_cmd)
    LOGGER.info("Docker container started on http://localhost:%d", port)


# --------------------------------------------------------------------------- #
# Vercel deployment guide
# --------------------------------------------------------------------------- #
def vercel_deployment_guide() -> str:
    """Return a concise Vercel deployment guide."""
    steps = [
        "Vercel Deployment Guide",
        "------------------------",
        "1. Authorize the deployment for the atharvnaik1's projects team:",
        f"   {VERCEL_AUTH_URL}",
        "2. Install the Vercel CLI (if not already installed):",
        "   $ npm i -g vercel",
        "3. Log in to Vercel:",
        "   $ vercel login",
        "4. Link the local project to the Vercel project:",
        "   $ vercel link --project <PROJECT_ID> --org <ORG_ID>",
        "5. Add required environment variables (replace placeholders):",
        "   $ vercel env add <NAME> <VALUE> --prod   # repeat for each variable",
        "6. Deploy to production:",
        "   $ vercel deploy --prod",
        "",
        "Prerequisites for Vercel deployment:",
        "   • Node.js >= 16 (for the Vercel CLI)",
        "   • A Vercel account with access to the atharvnaik1's projects team",
        "   • All project dependencies installed locally (pip install -r requirements.txt)",
    ]
    return "\n".join(steps)


def print_vercel_guide() -> None:
    """Print the Vercel deployment guide to stdout."""
    LOGGER.info("Displaying Vercel deployment guide:")
    print(vercel_deployment_guide())


# --------------------------------------------------------------------------- #
# Command‑line interface
# --------------------------------------------------------------------------- #
def main() -> None:
    parser = argparse.ArgumentParser(description="Project setup & deployment helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Prerequisites
    subparsers.add_parser("check-prereqs", help="Validate required tools are installed")

    # Docker
    docker_parser = subparsers.add_parser("docker", help="Docker related commands")
    docker_sub = docker_parser.add_subparsers(dest="docker_cmd", required=True)
    docker_sub.add_parser("build", help="Build Docker image")
    run_parser = docker_sub.add_parser("run", help="Run Docker container")
    run_parser.add_argument("--detach", action="store_true", help="Run container in background")
    run_parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Host port to bind the container (default: 8000)",
    )

    # Vercel
    subparsers.add_parser("vercel-guide", help="Print Vercel deployment instructions")

    args = parser.parse_args()

    try:
        if args.command == "check-prereqs":
            check_prerequisites()
        elif args.command == "docker":
            if args.docker_cmd == "build":
                docker_build()
            elif args.docker_cmd == "run":
                docker_run(detach=args.detach, port=args.port)
        elif args.command == "vercel-guide":
            print_vercel_guide()
    except Exception as exc:
        LOGGER.error("Error: %s", exc)
        sys.exit(1)


if __name__ == "__main__":
    main()