python
#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Setup script for the llm-microservice project.

This script clones the repository, creates a virtual environment, and installs
dependencies. 

⚠️ Vercel Deployment Authorization
---------------------------------
Before deploying this project to Vercel under the **atharvnaik1's projects** team,
a team member must authorize the deployment. See the updated
`VERCEL_AUTH.md` documentation for detailed steps.

Typical Vercel CLI workflow after authorization:
    $ vercel login
    $ vercel link --project <project-id> --org <org-id>
    $ vercel env add <NAME> <VALUE> --prod   # repeat for each env var
    $ vercel deploy --prod

Ensure the above steps are completed before running this setup script.
"""

import subprocess
import sys
import logging
from pathlib import Path

# --------------------------------------------------------------------------- #
# Vercel Deployment Authorization Section
# --------------------------------------------------------------------------- #
# Simple authorization URL (no job parameters) for team members to grant access.
VERCEL_AUTH_URL = (
    "https://vercel.com/git/authorize?"
    "team=atharvnaik1%20projects&"
    "slug=atharvnaik1s-projects&"
    "teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&"
    "type=github"
)

# Full URL with job context (kept for reference; not required for basic auth)
VERCEL_AUTHORIZATION_URL = (
    "https://vercel.com/git/authorize?"
    "team=atharvnaik1%20projects&"
    "slug=atharvnaik1s-projects&"
    "teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&"
    "type=github&"
    "job=%7B%22headInfo%22%3A%7B%22sha%22%3A%22833c0026d1efad5872766cc67c3da1240cbfaede%22%7D%2C%22id%22%3A%22QmYJzmhhoKdSXfTtDFYoLw4GaNfh5xFvwMhryCFwXaCGs6%22%2C%22org%22%3A%22atharvnaik1%22%2C%22prId%22%3A102%2C%22repo%22%3A%22ipaship-app-reviewer%22%7D"
)

def get_vercel_authorization_instructions() -> str:
    """Return step‑by‑step instructions for authorizing Vercel deployment."""
    steps = [
        "1. Open the following URL in a browser:",
        f"   {VERCEL_AUTH_URL}",
        "2. Sign in to Vercel if prompted.",
        "3. Review the permissions request for the **atharvnaik1's projects** team.",
        "4. Click **Authorize** to grant access.",
        "5. After authorization, set the required environment variables:",
        "   - VERCEL_ORG_ID=team_c0hqDrZckNBm5AkYTYHVKoE8",
        "   - VERCEL_PROJECT_ID=proj_XXXXXXXXXXXX",
        "   - VERCEL_TOKEN=your_vercel_token",
        "6. Use the Vercel CLI to link and deploy:",
        "   $ vercel login",
        "   $ vercel link --project <project-id> --org <org-id>",
        "   $ vercel env add <NAME> <VALUE> --prod   # repeat for each env var",
        "   $ vercel deploy --prod",
    ]
    return "\n".join(steps)

def display_vercel_authorization_steps() -> None:
    """Print Vercel deployment authorization steps to the console."""
    LOGGER.info("Vercel Deployment Authorization Steps:")
    print(get_vercel_authorization_instructions())

# --------------------------------------------------------------------------- #
# Vercel Authorization Documentation Reference Section
# --------------------------------------------------------------------------- #
def get_vercel_auth_doc_reference() -> str:
    """
    Return a short reference to the VERCEL_AUTH.md documentation file.
    This file contains the canonical, up‑to‑date instructions for authorizing
    Vercel deployments for the **atharvnaik1's projects** team.
    """
    doc_path = Path(__file__).parent / "VERCEL_AUTH.md"
    return (
        "For the most recent and detailed authorization guide, see:\n"
        f"    {doc_path.resolve()}\n"
        "\n"
        "The steps outlined below are a quick‑start summary. Always verify the "
        "full documentation before proceeding."
    )

def display_vercel_auth_doc_reference() -> None:
    """Print the VERCEL_AUTH.md reference to the console."""
    LOGGER.info("Vercel Authorization Documentation Reference:")
    print(get_vercel_auth_doc_reference())

# --------------------------------------------------------------------------- #
# Deploy to Vercel Section
# --------------------------------------------------------------------------- #
def get_deploy_to_vercel_instructions() -> str:
    """Return step‑by‑step instructions for deploying to Vercel."""
    steps = [
        "Deploy to Vercel",
        "-----------------",
        "1. Authorize the deployment for the **atharvnaik1's projects** team:",
        f"   {VERCEL_AUTH_URL}",
        "2. Ensure the following environment variables are set:",
        "   - VERCEL_ORG_ID=team_c0hqDrZckNBm5AkYTYHVKoE8",
        "   - VERCEL_PROJECT_ID=proj_XXXXXXXXXXXX",
        "   - VERCEL_TOKEN=your_vercel_token",
        "3. Log in to Vercel CLI:",
        "   $ vercel login",
        "4. Link the local project to the Vercel project:",
        "   $ vercel link --project $VERCEL_PROJECT_ID --org $VERCEL_ORG_ID",
        "5. Add any required environment variables to Vercel:",
        "   $ vercel env add <NAME> <VALUE> --prod   # repeat for each env var",
        "6. Deploy the project:",
        "   $ vercel deploy --prod",
        "",
        "After a successful deployment, Vercel will provide a URL where the service "
        "can be accessed."
    ]
    return "\n".join(steps)

def display_deploy_to_vercel_instructions() -> None:
    """Print Vercel deployment instructions to the console."""
    LOGGER.info("Vercel Deployment Instructions:")
    print(get_deploy_to_vercel_instructions())

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
# Custom exceptions
# --------------------------------------------------------------------------- #
class SetupError(Exception):
    """Base class for setup related errors."""


class GitCloneError(SetupError):
    """Raised when git clone fails."""


class VirtualEnvError(SetupError):
    """Raised when virtual environment creation fails."""


class DependencyInstallError(SetupError):
    """Raised when pip install fails."""


# --------------------------------------------------------------------------- #
# Helper functions
# --------------------------------------------------------------------------- #
def _run_command(command: list[str]) -> subprocess.CompletedProcess:
    """Run a shell command and return the completed process."""
    LOGGER.debug("Running command: %s", " ".join(command))
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    LOGGER.debug("Command output: %s", result.stdout.strip())
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            returncode=result.returncode,
            cmd=command,
            output=result.stdout,
        )
    return result


# --------------------------------------------------------------------------- #
# Core workflow
# --------------------------------------------------------------------------- #
def clone_repository(repo_url: str, target_dir: Path) -> None:
    """Clone a Git repository.

    Args:
        repo_url: HTTPS URL of the repository.
        target_dir: Destination directory for the clone.

    Raises:
        ValueError: If ``repo_url`` or ``target_dir`` is empty.
        GitCloneError: If the ``git clone`` command fails.
    """
    if not repo_url:
        raise ValueError("Repository URL must not be empty.")
    if target_dir.exists():
        raise ValueError(f"Target directory '{target_dir}' already exists.")

    try:
        LOGGER.info("Cloning repository %s → %s", repo_url, target_dir)
        _run_command(["git", "clone", repo_url, str(target_dir)])
        LOGGER.info("Repository cloned successfully.")
    except subprocess.CalledProcessError as exc:
        raise GitCloneError(f"Failed to clone repository: {exc.output}") from exc


def create_virtual_environment(venv_path: Path) -> None:
    """Create a Python virtual environment.

    Args:
        venv_path: Path where the virtual environment should be created.

    Raises:
        VirtualEnvError: If the ``python -m venv`` command fails.
    """
    if venv_path.exists():
        LOGGER.warning("Virtual environment already exists at %s", venv_path)
        return
    try:
        LOGGER.info("Creating virtual environment at %s", venv_path)
        _run_command([sys.executable, "-m", "venv", str(venv_path)])
        LOGGER.info("Virtual environment created successfully.")
    except subprocess.CalledProcessError as exc:
        raise VirtualEnvError(f"Failed to create virtual environment: {exc.output}") from exc


def install_dependencies(venv_path: Path, requirements_file: Path) -> None:
    """Install dependencies using pip inside the virtual environment.

    Args:
        venv_path: Path to the virtual environment.
        requirements_file: Path to a requirements.txt file.

    Raises:
        DependencyInstallError: If pip install fails.
    """
    pip_executable = venv_path / "bin" / "pip"
    if not pip_executable.is_file():
        raise DependencyInstallError("pip executable not found in virtual environment.")
    try:
        LOGGER.info("Installing dependencies from %s", requirements_file)
        _run_command([str(pip_executable), "install", "-r", str(requirements_file)])
        LOGGER.info("Dependencies installed successfully.")
    except subprocess.CalledProcessError as exc:
        raise DependencyInstallError(f"Failed to install dependencies: {exc.output}") from exc


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #
def main() -> None:
    # Example usage (replace with real values as needed)
    repo_url = "https://github.com/atharvnaik1/ipaship-app-reviewer.git"
    target_dir = Path.cwd() / "ipaship-app-reviewer"
    venv_path = target_dir / ".venv"
    requirements_file = target_dir / "requirements.txt"

    # Display Vercel authorization reference before any other actions
    display_vercel_auth_doc_reference()
    display_vercel_authorization_steps()

    # Proceed with setup
    clone_repository(repo_url, target_dir)
    create_virtual_environment(venv_path)
    install_dependencies(venv_path, requirements_file)

    # Finally, show deployment instructions
    display_deploy_to_vercel_instructions()


if __name__ == "__main__":
    main()