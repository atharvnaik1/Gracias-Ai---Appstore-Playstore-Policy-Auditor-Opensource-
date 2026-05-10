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
a team member must authorize the deployment. Use the following URL to grant
access:

https://vercel.com/git/authorize?team=atharvnaik1%20projects&slug=atharvnaik1s-projects&teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&type=github&job=%7B%22headInfo%22%3A%7B%22sha%22%3A%22833c0026d1efad5872766cc67c3da1240cbfaede%22%7D%2C%22id%22%3A%22QmYJzmhhoKdSXfTtDFYoLw4GaNfh5xFvwMhryCFwXaCGs6%22%2C%22org%22%3A%22atharvnaik1%22%2C%22prId%22%3A102%2C%22repo%22%3A%22ipaship-app-reviewer%22%7D)

Required environment variables (example):
    VERCEL_ORG_ID=team_c0hqDrZckNBm5AkYTYHVKoE8
    VERCEL_PROJECT_ID=proj_XXXXXXXXXXXX
    VERCEL_TOKEN=your_vercel_token

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
        f"   {VERCEL_AUTHORIZATION_URL}",
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
        LOGGER.warning("Virtual environment already exists at %s – skipping creation.", venv_path)
        return

    try:
        LOGGER.info("Creating virtual environment at %s", venv_path)
        _run_command([sys.executable, "-m", "venv", str(venv_path)])
        LOGGER.info("Virtual environment created successfully.")
    except subprocess.CalledProcessError as exc:
        raise VirtualEnvError(f"Failed to create virtual environment: {exc.output}") from exc


def install_dependencies(venv_path: Path, requirements_file: Path) -> None:
    """Install project dependencies using ``pip``.

    Args:
        venv_path: Path to the previously created virtual environment.
        requirements_file: Path to a ``requirements.txt`` file.

    Raises:
        FileNotFoundError: If ``requirements.txt`` does not exist.
        DependencyInstallError: If the ``pip install`` command fails.
    """
    if not requirements_file.is_file():
        raise FileNotFoundError(f"Requirements file not found: {requirements_file}")

    pip_executable = venv_path / ("Scripts" if sys.platform == "win32" else "bin") / "pip"
    if not pip_executable.is_file():
        raise VirtualEnvError(f"pip not found in virtual environment at {pip_executable}")

    try:
        LOGGER.info("Installing dependencies from %s", requirements_file)
        _run_command([str(pip_executable), "install", "-r", str(requirements_file)])
        LOGGER.info("Dependencies installed successfully.")
    except subprocess.CalledProcessError as exc:
        raise DependencyInstallError(f"Failed to install dependencies: {exc.output}") from exc


def main(repo_url: str, base_dir: Path) -> None:
    """Orchestrate the full setup process.

    Args:
        repo_url: HTTPS URL of the Git repository.
        base_dir: Directory where the repository will be cloned.
    """
    repo_dir = base_dir / "llm-microservice"
    venv_dir = repo_dir / ".venv"
    requirements_path = repo_dir / "requirements.txt"

    try:
        clone_repository(repo_url, repo_dir)
        create_virtual_environment(venv_dir)
        install_dependencies(venv_dir, requirements_path)
        LOGGER.info("Setup completed successfully.")
        LOGGER.info("\nVercel Deployment Authorization Instructions:\n%s", get_vercel_authorization_instructions())
    except SetupError as err:
        LOGGER.error("Setup failed: %s", err)
        sys.exit(1)


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
if __name__ == "__main__":
    # Example usage:
    #   python setup.py https://github.com/your-org/llm-microservice.git /tmp
    if len(sys.argv) != 3:
        LOGGER.error("Usage: %s <repo_url> <target_base_dir>", sys.argv[0])
        sys.exit(2)

    repository_url = sys.argv[1]
    base_directory = Path(sys.argv[2]).expanduser().resolve()
    main(repository_url, base_directory)