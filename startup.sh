#!/bin/bash
# =========================================================================
# Ukussa Member Accept Bot VPS Startup Script
# Automatically pulls the latest code from GitHub and restarts the bot.
# =========================================================================

echo "=== [$(date)] Starting Ukussa Accept Bot VPS Update & Startup ==="

# Navigate to the bot directory
cd "$(dirname "$0")" || exit

# 1. Pull latest code from GitHub
echo "Pulling latest code from GitHub..."
git fetch --all
git reset --hard origin/main

# 2. Install any newly added package dependencies
echo "Checking and updating dependencies..."
npm install --no-audit --no-fund --omit=dev

# 3. Start or restart the bot using PM2
echo "Managing PM2 process..."
if pm2 list | grep -q "ukussa-accept-bot"; then
    echo "PM2 process found. Restarting..."
    pm2 restart "ukussa-accept-bot"
else
    echo "PM2 process not found. Starting new process..."
    pm2 start index.js --name "ukussa-accept-bot"
fi

# Save PM2 list state to load automatically on server restart
pm2 save

echo "=== [$(date)] Startup & Update Complete! ==="
