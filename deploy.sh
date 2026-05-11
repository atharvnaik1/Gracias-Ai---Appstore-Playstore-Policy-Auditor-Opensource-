bash
#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# ipaShip - Ubuntu 24.04 Deployment Script
# Target: root@216.48.182.78
# ============================================================

APP_NAME="ipaship"
APP_DIR="/opt/ipaship"
NODE_MAJOR=20
APP_PORT=8080
SERVER_IP="216.48.182.78"

# ─── 0. Vercel Team Authorization & CLI Check ───────────────────────
export VERCEL_TEAM_ID="team_c0hqDrZckNBm5AkYTYHVKoE8"
export VERCEL_TEAM_SLUG="atharvnaik1"
TEAM_NAME="atharvnaik1's projects"

# Ensure Vercel CLI is installed
if ! command -v vercel &>/dev/null; then
    echo "Vercel CLI not found. Installing globally via npm..."
    npm install -g vercel >/dev/null 2>&1
fi

# Ensure Docker is installed
if ! command -v docker &>/dev/null; then
    echo "Docker not found. Installing..."
    apt-get update -qq
    apt-get install -y docker.io >/dev/null 2>&1
    systemctl enable docker --now >/dev/null 2>&1
fi

# Ensure the user is logged into Vercel
if ! vercel whoami &>/dev/null; then
    echo "You are not logged into Vercel. Opening login prompt..."
    vercel login || { echo "ERROR: Vercel login failed."; exit 1; }
fi

# Ensure the project is linked to the correct Vercel team
if [ ! -f "$APP_DIR/.vercel/project.json" ]; then
    echo ""
    echo "=== VERCEL PROJECT LINKING REQUIRED ==="
    echo "Linking the project to the Vercel team \"$TEAM_NAME\"..."
    mkdir -p "$APP_DIR"
    cd "$APP_DIR"
    vercel link --project "$APP_NAME" --team "$VERCEL_TEAM_SLUG" || { echo "ERROR: Vercel link failed."; exit 1; }
    touch "$APP_DIR/.vercel_authorized"
    echo "Linking complete. Re-run the deployment script."
    exit 1
fi

# Verify the marker file exists (authorization step)
if [ ! -f "$APP_DIR/.vercel_authorized" ]; then
    echo ""
    echo "=== VERCEL TEAM AUTHORIZATION REQUIRED ==="
    echo "The Vercel team \"$TEAM_NAME\" has not yet authorized this deployment."
    echo "Please authorize the deployment by visiting the following URL:"
    echo "https://vercel.com/git/authorize?team=$(printf '%s' \"$TEAM_NAME\" | jq -s -R -r @uri)&slug=atharvnaik1s-projects&teamId=${VERCEL_TEAM_ID}&type=github&job=%7B%22headInfo%22%3A%7B%22sha%22%3A%225404aa6b82d178cb7f53c8bb6d252962038819d1%22%7D%2C%22id%22%3A%22Qmema1agMRtSB3nfshejPmmAWBrYNK6zKicZTJuG9QTP1e%22%2C%22org%22%3A%22atharvnaik1%22%2C%22prId%22%3A103%2C%22repo%22%3A%22ipaship-app-reviewer%22%7D"
    echo ""
    echo "After authorizing, run the Vercel CLI to link the project to the team:"
    echo "    vercel link --project $APP_NAME --team \"$VERCEL_TEAM_SLUG\""
    echo "This will create a .vercel directory with the proper configuration."
    echo ""
    echo "Once linked, create a marker file so the script knows the step is complete:"
    echo "    touch $APP_DIR/.vercel_authorized"
    echo "Then re-run this deployment script."
    echo ""
    exit 1
fi

echo ""
echo "=========================================="
echo "  ipaShip - Deployment Script"
echo "=========================================="
echo ""

# ─── 1. System packages ───────────────────────
echo "==> [1/10] Updating system & installing dependencies..."
apt-get update -qq
apt-get install -y curl git unzip nginx ufw >/dev/null 2>&1
echo "    Done."

# ─── 2. Node.js ───────────────────────────────
if command -v node &>/dev/null && [[ "$(node -v | cut -d. -f1 | tr -d v)" -ge 18 ]]; then
    echo "==> [2/10] Node.js $(node -v) already installed. Skipping."
else
    echo "==> [2/10] Installing Node.js ${NODE_MAJOR}.x..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
    echo "    Node $(node -v), npm $(npm -v)"
fi

# ─── 3. PM2 ───────────────────────────────────
if command -v pm2 &>/dev/null; then
    echo "==> [3/10] PM2 already installed. Skipping."
else
    echo "==> [3/10] Installing PM2..."
    npm install -g pm2 >/dev/null 2>&1
    echo "    Done."
fi

# ─── 4. App code ──────────────────────────────
echo "==> [4/10] Setting up application..."
if [ -d "$APP_DIR" ]; then
    echo "    Directory exists. Pulling latest code..."
    cd "$APP_DIR"
    git pull origin main || { echo "ERROR: git pull failed"; exit 1; }
else
    echo "    Cloning repository..."
    git clone https://github.com/atharvnaik1/ipaShip-Ai---Appstore-Playstore-Policy-Auditor-Opensource-.git "$APP_DIR" || { echo "ERROR: git clone failed"; exit 1; }
    cd "$APP_DIR"
fi

# ─── 5. Environment file ──────────────────────
if [ ! -f "$APP_DIR/.env.local" ]; then
    echo "==> [5/10] .env.local not found!"
    echo "    Create it manually:"
    echo "    echo 'MONGODB_URI=your_mongodb_uri_here' > $APP_DIR/.env.local"
    echo ""
    echo "    Then re-run this script."
    exit 1
else
    echo "==> [5/10] .env.local exists. Skipping."
fi

# ─── 6. Install dependencies ───────────────────────
echo "==> [6/10] Installing npm dependencies..."
cd "$APP_DIR"
npm ci >/dev/null 2>&1 || { echo "ERROR: npm ci failed"; exit 1; }

# ─── 7. Build Next.js app ───────────────────────
echo "==> [7/10] Building Next.js app..."
npm run build >/dev/null 2>&1 || { echo "ERROR: npm run build failed"; exit 1; }
echo "    Build complete."

# ─── 8. Build Docker image ───────────────────────
echo "==> [8/10] Building Docker image..."
DOCKER_IMAGE="${APP_NAME}:latest"
docker build -t "$DOCKER_IMAGE" . >/dev/null 2>&1 || { echo "ERROR: Docker build failed"; exit 1; }
echo "    Docker image $DOCKER_IMAGE built."

# ─── 9. Vercel Authorization Check ───────────────────────
echo "==> [9/10] Verifying Vercel authorization..."
if ! vercel whoami &>/dev/null; then
    echo "Not logged into Vercel. Initiating login..."
    vercel login || { echo "ERROR: Vercel login failed."; exit 1; }
fi

# Ensure the project is linked to the correct Vercel team
vercel link --team "$VERCEL_TEAM_SLUG" --yes >/dev/null 2>&1 || { echo "ERROR: Vercel project linking failed."; exit 1; }

# ─── 10. Deploy to Vercel (Docker) ───────────────────
DEPLOY_LOG="/var/log/ipaash_vercel_deploy.log"
{
    echo "=== Vercel Deployment Started $(date -u) ==="
    if [ -z "${VERCEL_TOKEN:-}" ]; then
        echo "ERROR: VERCEL_TOKEN environment variable is not set."
        exit 1
    fi
    # Deploy using Vercel CLI with Docker support
    vercel --prod --docker --token "$VERCEL_TOKEN" --team "$VERCEL_TEAM_SLUG" --confirm
    DEPLOY_EXIT=$?
    if [ $DEPLOY_EXIT -ne 0 ]; then
        echo "ERROR: Vercel deployment failed with exit code $DEPLOY_EXIT."
        exit $DEPLOY_EXIT
    else
        echo "Vercel deployment succeeded."
    fi
    echo "=== Vercel Deployment Finished $(date -u) ==="
} >> "$DEPLOY_LOG" 2>&1

# ─── 11. PM2 & Nginx configuration ─────────────────
echo "==> [11/10] Starting app with PM2..."
pm2 delete "$APP_NAME" 2>/dev/null || true
cd "$APP_DIR"
PORT=$APP_PORT pm2 start npm --name "$APP_NAME" -- start
pm2 save >/dev/null 2>&1
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

cat > /etc/nginx/sites-available/ipaship << NGINXEOF
server {
    listen 80;
    server_name $SERVER_IP;

    client_max_body_size 200M;

    proxy_connect_timeout 60s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
    }
}
GINXEOF

ln -sf /etc/nginx/sites-available/ipaship /etc/nginx/sites-enabled/ipaship
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>&1 | head -2
systemctl enable nginx >/dev/null 2>&1
systemctl restart nginx

# ─── Firewall ──────────────────────────────────
echo "==> Configuring firewall..."
ufw allow OpenSSH >/dev/null 2>&1
ufw allow 'Nginx Full' >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo ""
echo "  App:    http://$SERVER_IP"
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs $APP_NAME"
echo "  Vercel Deploy Log: $DEPLOY_LOG"
echo "=========================================="
echo ""