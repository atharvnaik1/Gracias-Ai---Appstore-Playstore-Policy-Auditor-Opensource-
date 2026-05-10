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

# ─── 0. Vercel Team Authorization & CLI Check ───────────────────────
# Vercel team identifier (used by the Vercel CLI)
export VERCEL_TEAM_ID="team_c0hqDrZckNBm5AkYTYHVKoE8"
export VERCEL_TEAM_SLUG="atharvnaik1"
TEAM_NAME="atharvnaik1's projects"

# Ensure Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Vercel CLI not found. Installing globally via npm..."
    npm install -g vercel > /dev/null 2>&1
fi

# Ensure the user is logged into Vercel
if ! vercel whoami &> /dev/null; then
    echo "You are not logged into Vercel. Opening login prompt..."
    vercel login
fi

# Ensure the project is linked to the correct Vercel team
if [ ! -f "$APP_DIR/.vercel/project.json" ]; then
    echo ""
    echo "=== VERCEL PROJECT LINKING REQUIRED ==="
    echo "Linking the project to the Vercel team \"$TEAM_NAME\"..."
    mkdir -p "$APP_DIR"
    cd "$APP_DIR"
    vercel link --project "$APP_NAME" --team "$VERCEL_TEAM_SLUG"
    # Create a marker file to indicate linking is complete
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

# ─── 4. App code ──────────────────────────────
echo "==> [4/8] Setting up application..."
if [ -d "$APP_DIR" ]; then
    echo "    Directory exists. Pulling latest code..."
    cd "$APP_DIR"
    git pull origin main
else
    echo "    Cloning repository..."
    git clone https://github.com/atharvnaik1/ipaShip-Ai---Appstore-Playstore-Policy-Auditor-Opensource-.git "$APP_DIR"
    cd "$APP_DIR"
fi

# ─── 5. Environment file ──────────────────────
if [ ! -f "$APP_DIR/.env.local" ]; then
    echo "==> [5/8] .env.local not found!"
    echo "    Create it manually:"
    echo "    echo 'MONGODB_URI=your_mongodb_uri_here' > $APP_DIR/.env.local"
    echo ""
    echo "    Then re-run this script."
    exit 1
else
    echo "==> [5/8] .env.local exists. Skipping."
fi

# ─── 6. Build ─────────────────────────────────
echo "==> [6/8] Installing dependencies & building..."
cd "$APP_DIR"
npm ci 2>&1 | tail -3
echo "    Building Next.js app..."
npm run build 2>&1 | tail -5
echo "    Build complete."

# ─── 7. PM2 ─────────────────────────────��─────
echo "==> [7/8] Starting app with PM2..."
pm2 delete "$APP_NAME" 2>/dev/null || true
cd "$APP_DIR"
PORT=$APP_PORT pm2 start npm --name "$APP_NAME" -- start
pm2 save > /dev/null 2>&1
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true

# ─── 8. Nginx ─────────────────────────────────────
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

# ─── Firewall ──────────────────────────────────
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