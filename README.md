%s", result.stdout.strip())
    if result.returncode != 0:
        raise subprocess.CalledProcessError(
            returncode=result.returncode,
            cmd=command,
            output=result.stdout,
        )


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
