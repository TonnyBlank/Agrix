#!/usr/bin/env bash
# ============================================================
# AgriLink X — Cron Job Setup
# Installs the resolve_stuck_payments management command
# as a recurring cron job every 10 minutes.
# ============================================================
# Usage:
#   cd backend
#   bash scripts/setup_cron.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PYTHON="$BACKEND_DIR/.venv/bin/python3"
MANAGE="$BACKEND_DIR/manage.py"
LOG_DIR="/var/log/agrilink"

if [ ! -f "$PYTHON" ]; then
    echo "ERROR: Python venv not found at $PYTHON"
    echo "Run: cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
    exit 1
fi

if [ ! -f "$MANAGE" ]; then
    echo "ERROR: manage.py not found at $MANAGE"
    exit 1
fi

# Create log dir if it doesn't exist (requires sudo if /var/log is restricted)
sudo mkdir -p "$LOG_DIR" 2>/dev/null || mkdir -p "$HOME/.agrilink/logs" && LOG_DIR="$HOME/.agrilink/logs"
sudo chown "$(whoami)" "$LOG_DIR" 2>/dev/null || true

CRON_CMD="*/10 * * * * cd $BACKEND_DIR && $PYTHON $MANAGE resolve_stuck_payments >> $LOG_DIR/stuck_payments.log 2>&1"

# Check if already installed
(crontab -l 2>/dev/null | grep -qF "resolve_stuck_payments") && {
    echo "Cron job already installed."
    echo "Current entry:"
    crontab -l | grep "resolve_stuck_payments"
    exit 0
}

# Install
(crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -

echo ""
echo "✓ Cron job installed successfully."
echo ""
echo "Schedule: every 10 minutes"
echo "Command:  $CRON_CMD"
echo "Logs:     $LOG_DIR/stuck_payments.log"
echo ""
echo "To remove, run:"
echo "  crontab -e"
echo "  (delete the line containing 'resolve_stuck_payments')"
echo ""
echo "Test it now with:"
echo "  $PYTHON $MANAGE resolve_stuck_payments --dry-run"
