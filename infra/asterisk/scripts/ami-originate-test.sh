#!/usr/bin/env bash
# Places one outbound test call over raw AMI, using nothing but bash + nc —
# exercises the exact protocol path the backend's AmiClient uses
# (backend/src/calling/telephony/ami-client.ts), without needing the
# backend running. Good for isolating "is it Asterisk/AMI, or is it our
# Node code" when something's not working end-to-end.
#
# Usage:
#   AMI_HOST=127.0.0.1 AMI_PORT=5038 AMI_USER=backend AMI_SECRET=... \
#     ./ami-originate-test.sh +91XXXXXXXXXX ai
set -euo pipefail

NUMBER="${1:?Usage: $0 <number-to-call> [ai|internal]}"
BRIDGE_TARGET="${2:-internal}"
HOST="${AMI_HOST:-127.0.0.1}"
PORT="${AMI_PORT:-5038}"
USER="${AMI_USER:?Set AMI_USER}"
SECRET="${AMI_SECRET:?Set AMI_SECRET}"
ACTION_ID="test-$(date +%s)"

command -v nc >/dev/null || { echo "This script needs netcat (nc) installed." >&2; exit 1; }

# AMI is plain text over TCP: one "Key: Value" per line, blank line ends a
# block. nc sends our two actions back-to-back and reads whatever Asterisk
# replies with for a few seconds (banner, LoginResponse, OriginateResponse).
{
  printf 'Action: Login\r\nUsername: %s\r\nSecret: %s\r\nActionID: %s-login\r\n\r\n' \
    "${USER}" "${SECRET}" "${ACTION_ID}"
  sleep 0.5
  printf 'Action: Originate\r\nChannel: PJSIP/%s@airtel-trunk\r\nContext: outbound-bridge\r\nExten: s\r\nPriority: 1\r\nAsync: true\r\nActionID: %s\r\nVariable: BRIDGE_TARGET=%s\r\n\r\n' \
    "${NUMBER}" "${ACTION_ID}" "${BRIDGE_TARGET}"
  sleep 3
  printf 'Action: Logoff\r\n\r\n'
} | nc -w 5 "${HOST}" "${PORT}"
