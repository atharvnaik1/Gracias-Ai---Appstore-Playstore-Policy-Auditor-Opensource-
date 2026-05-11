python
# ------------------------------------------------------------
# Vercel & Docker Deployment Documentation
# ------------------------------------------------------------
# This project can be deployed to Vercel (as part of the
# "atharvnaik1's projects" team) **or** run locally via Docker.
#
# ------------------------------------------------------------------
# 1️⃣  Authorization (Vercel)
# ------------------------------------------------------------------
# A team member must grant Vercel access to the GitHub repository.
# Visit the URL below (replace placeholders if necessary) and
# click **Authorize Vercel**:
#
#   https://vercel.com/git/authorize?team=atharvnaik1%27s%20projects\
#   &slug=atharvnaik1s-projects\
#   &teamId=team_c0hqDrZckNBm5AkYTYHVKoE8\
#   &type=github\
#   &job=%7B%22headInfo%22%3A%7B%22sha%22%3A%225404aa6b82d178cb7f53c8bb6d252962038819d1%22%7D%2C%22id%22%3A%22Qmema1agMRtSB3nfshejPmmAWBrYNK6zKicZTJuG9QTP1e%22%2C%22org%22%3A%22atharvnaik1%22%2C%22prId%22%3A103%2C%22repo%22%3A%22ipaship-app-reviewer%22%7D
#
# ------------------------------------------------------------------
# Vercel Deployment
# ------------------------------------------------------------------
# To deploy to Vercel, the team must first authorize Vercel to access
# the repository. Visit the following URL and click **Authorize Vercel**:
#
#   https://vercel.com/git/authorize?team=atharvnaik1%27%20projects&slug=atharvnaik1s-projects&teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&type=github
#
# After authorization, proceed with the deployment steps in section 3️⃣.
#
# ------------------------------------------------------------------
# 2️⃣  Required Environment Variables
# ------------------------------------------------------------------
# The following variables **must** be defined either in Vercel's
# Environment Variables UI or in a local `.env` file (for Docker).
#
# | Variable                | Description                                          |
# |--------------------------|------------------------------------------------------|
# | `MONGODB_URI`            | MongoDB connection string (e.g., mongodb+srv://…)   |
# | `GITHUB_TOKEN`           | Personal access token for GitHub API access          |
# | `API_KEY`                | Generic API key used by the application             |
# | `VERCEL_TEAM_ID`         | Vercel team identifier (e.g., `team_c0hqDrZckNBm5AkYTYHVKoE8`) |
# | `VERCEL_PROJECT_ID`      | Vercel project identifier (optional, CLI only)      |
# | `DOCKER_IMAGE`           | Full image name (e.g., `ghcr.io/yourorg/yourapp`)   |
# | `DOCKER_REGISTRY`        | Registry URL (e.g., `ghcr.io`)                       |
# | `NVIDIA_API_KEY`         | NVIDIA API key (required for AI provider)           |
# | `CLAUDE_API_KEY`         | Anthropic Claude API key (required for AI provider) |
# | `NVIDIA_ENDPOINT`        | (optional) NVIDIA endpoint – defaults to `https://api.nvidia.com/v1/completions` |
# | `CLAUDE_ENDPOINT`        | (optional) Claude endpoint – defaults to `https://api.anthropic.com/v1/complete` |
# | `REQUEST_TIMEOUT`        | HTTP request timeout in seconds (default: 30)       |
# | `MAX_RETRIES`            | Number of retry attempts on failure (default: 3)    |
# | `PROVIDER_DEFAULT`       | Default AI provider – `nvidia` or `claude` (default: `nvidia`) |
#
# **Tip:** Keep a `.env.example` file in the repo root with the keys
# (without values) so contributors know what to set.
#
# ------------------------------------------------------------------
# 3️⃣  Build & Deployment Steps
# ------------------------------------------------------------------
# ### Vercel (CLI)
# 1. Install the Vercel CLI (if not already):
#       npm i -g vercel
# 2. Authenticate:
#       vercel login
# 3. Link the project (run once):
#       vercel link --prod --confirm
# 4. Deploy to production:
#       vercel --prod --confirm
#
#   The CLI will read the environment variables from Vercel's UI.
#   If you prefer to pass them locally, create a `.env` file and run:
#       vercel --prod --env-file .env
#
# ### Docker
# 1. Ensure Docker Desktop or Docker Engine is running.
# 2. Build the image:
#       docker build -t $DOCKER_IMAGE .
# 3. Push to the registry (requires login):
#       echo $DOCKER_REGISTRY_TOKEN | docker login $DOCKER_REGISTRY --username $DOCKER_REGISTRY_USER --password-stdin
#       docker push $DOCKER_IMAGE
# 4. Run the container:
#       docker run -d \
#           -p 8080:8080 \
#           --env-file .env \
#           $DOCKER_IMAGE
#
#   The container will start the FastAPI/Uvicorn server (or whatever entrypoint
#   is defined in the Dockerfile). Adjust the `-p` mapping if your app
#   listens on a different port.
#
# ------------------------------------------------------------------
# 4️⃣  Troubleshooting
# ------------------------------------------------------------------
# - **Vercel: “Deployment failed”**  
#   • Check Vercel dashboard logs (`vercel logs <deployment-id>`).  
#   • Verify `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` are correct.  
#   • Ensure all required env vars are set (see section 2).  
#   • Re‑run the authorization URL if the GitHub integration is missing.
#
# - **Docker: Build errors**  
#   • Make sure the `Dockerfile` is present at the repo root.  
#   • Verify that the base image supports the required Python version.  
#   • Ensure the `.env` file contains all variables listed in section 2.
#
# - **Runtime errors**  
#   • Run the container locally with `docker logs <container-id>` to view stdout.  
#   • Use `vercel logs` for Vercel deployments.
#
# ------------------------------------------------------------------
# 5️⃣  Example Dockerfile (place in repository root)
# ------------------------------------------------------------------
#