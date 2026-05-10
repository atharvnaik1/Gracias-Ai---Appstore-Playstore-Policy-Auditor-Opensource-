bash
#!/bin/bash
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
VERCEL_TEAM="atharvnaik1"
VERCEL_PROJECT="ipaship"   # Vercel project name (must match the Vercel dashboard)

echo ""
echo "=========================================="
echo "  ipaShip - Deployment Script"
echo "=========================================="
echo ""

# ─── 1. System packages ───────────────────────
echo "==> [1/8] Updating system & installing dependencies..."
apt-get update -qq
apt-get install -y curl git unzip nginx ufw > /dev/null 2>&1
echo "    Done."

# ─── 2. Node.js ───────────────────────────────
if command -v node &> /dev/null && [[ "$(node -v | cut -d. -f1 | tr -d v)" -ge 18 ]]; then
    echo "==> [2/8] Node.js $(node -v) already installed. Skipping."
else
    echo "==> [2/8] Installing Node.js ${NODE_MAJOR}.x..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
    echo "    Node $(node -v), npm $(npm -v)"
fi

# ─── 3. PM2 ───────────────────────────────────
if command -v pm2 &> /dev/null; then
    echo "==> [3/8] PM2 already installed. Skipping."
else
    echo "==> [3/8] Installing PM2..."
    npm install -g pm2 > /dev/null 2>&1
    echo "    Done."
fi

# ─── 4. Vercel CLI ───────────────────────────
if command -v vercel &> /dev/null; then
    echo "==> [4/8] Vercel CLI already installed. Skipping."
else
    echo "==> [4/8] Installing Vercel CLI..."
    npm install -g vercel > /dev/null 2>&1
    echo "    Vercel CLI installed."
fi

# ─── 5. App code ──────────────────────────────
echo "==> [5/8] Setting up application..."
if [ -d "$APP_DIR" ]; then
    echo "    Directory exists. Pulling latest code..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "    Cloning repository..."
    git clone https://github.com/atharvnaik1/ipaShip-Ai---Appstore-Playstore-Policy-Auditor-Opensource-.git "$APP_DIR"
    cd "$APP_DIR"
fi

# ─── 6. Environment file ──────────────────────
if [ ! -f "$APP_DIR/.env.local" ]; then
    echo "==> [6/8] .env.local not found!"
    echo "    Create it manually:"
    echo "    echo 'MONGODB_URI=your_mongodb_uri_here' > $APP_DIR/.env.local"
    echo ""
    echo "    Then re-run this script."
    exit 1
else
    echo "==> [6/8] .env.local exists. Skipping."
fi

# ─── 7. Build ─────────────────────────────────
echo "==> [7/8] Installing dependencies & building..."
cd "$APP_DIR"
npm ci 2>&1 | tail -3
echo "    Building Next.js app..."
npm run build 2>&1 | tail -5
echo "    Build complete."

# ─── 8. Vercel Authorization & Deployment ───────
echo "==> [8/8] Verifying Vercel authentication and team access..."

# Ensure we are logged in or have a token
if [ -z "${VERCEL_TOKEN:-}" ]; then
    # No token provided – fall back to interactive login
    if ! vercel whoami > /dev/null 2>&1; then
        echo "    Not logged into Vercel. Initiating login..."
        vercel login
    fi
else
    # Token is set – export for Vercel CLI usage
    export VERCEL_TOKEN="${VERCEL_TOKEN}"
    echo "    Using VERCEL_TOKEN for authentication."
fi

# Verify we have access to the correct team
if ! vercel teams list | grep -q "$VERCEL_TEAM"; then
    echo "    Error: Vercel team '$VERCEL_TEAM' not found in your account."
    echo "    Please ensure you are a member of the team and re-run the script."
    exit 1
fi

# Link the repository to the Vercel project (fails if repo not authorized)
if ! vercel link --project "$VERCEL_PROJECT" --git-provider github --repo "atharvnaik1/ipaShip-Ai---Appstore-Playstore-Policy-Auditor-Opensource-" --team "$VERCEL_TEAM" > /dev/null 2>&1; then
    echo "    Error: Repository is not authorized for team '$VERCEL_TEAM'."
    echo "    Please authorize the repository via the Vercel dashboard or the provided URL."
    echo "    https://vercel.com/git/authorize?team=${VERCEL_TEAM}%20projects&slug=atharvnaik1s-projects&teamId=team_c0hqDrZckNBm5AkYTYHVKoE8&type=github&job=%7B%22headInfo%22%3A%7B%22sha%22%3A%22833c0026d1efad5872766cc67c3da1240cbfaede%22%7D%2C%22id%22%3A%22QmYJzmhhoKdSXfTtDFYoLw4GaNfh5xFvwMhryCFwXaCGs6%22%2C%22org%22%3A%22atharvnaik1%22%2C%22prId%22%3A102%2C%22repo%22%3A%22ipaship-app-reviewer%22%7D"
    exit 1
fi

# Deploy to Vercel with the correct team (use token if available)
if [ -n "${VERCEL_TOKEN:-}" ]; then
    vercel --prod --team "$VERCEL_TEAM" --token "$VERCEL_TOKEN"
else
    vercel --prod --team "$VERCEL_TEAM"
fi
echo "    Vercel deployment triggered."

# ─── 9. PM2 ───────────────────────────────────
echo "==> [9/9] Starting app with PM2..."
pm2 delete "$APP_NAME" 2>/dev/null || true
cd "$APP_DIR"
PORT=$APP_PORT pm2 start npm --name "$APP_NAME" -- start
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true

# ─── 10. Nginx ─────────────────────────────────────
echo "==> Configuring Nginx..."
cat > /etc/nginx/sites-available/ipaship << NGINXEOF
server {
    listen 80;
    server_name $SERVER_IP;

    # Allow large file uploads (app limit is 150MB)
    client_max_body_size 200M;

    # Extended timeouts for AI analysis (up to 5+ minutes)
    proxy_connect_timeout 60s;
    proxy_send_timeout 600s;
    proxy_read_timeout 600s;
    send_timeout 600s;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;

        # SSE / streaming support
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;

        # Forward real client IP (used by rate limiter)
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Disable buffering for streaming responses
        proxy_buffering off;
        proxy_cache off;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/ipaship /etc/nginx/sites-enabled/ipaship
rm -f /etc/nginx/sites-enabled/default
nginx -t 2>&1 | head -2
systemctl enable nginx > /dev/null 2>&1
systemctl restart nginx

# ─── 11. Firewall ──────────────────────────────────
echo "==> Configuring firewall..."
ufw allow OpenSSH > /dev/null 2>&1
ufw allow 'Nginx Full' > /dev/null 2>&1
ufw --force enable > /dev/null 2>&1

echo ""
echo "=========================================="
echo "  Deployment Complete!"
echo ""
echo "  App:    http://$SERVER_IP"
echo "  Status: pm2 status"
echo "  Logs:   pm2 logs $APP_NAME"
echo "=========================================="
echo ""