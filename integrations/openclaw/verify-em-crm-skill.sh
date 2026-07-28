#!/usr/bin/env bash
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
source "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null

openclaw config validate
openclaw skills info em-crm --json \
  | jq '{name, eligible, disabled, missing: (.missing // [])}'
openclaw gateway restart
sleep 3
openclaw gateway status
