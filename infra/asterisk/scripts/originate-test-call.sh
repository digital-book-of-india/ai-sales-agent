#!/usr/bin/env bash
# Places one outbound test call straight from the Asterisk CLI — no backend,
# no AMI client, just `asterisk -rx`. This is the fastest way to prove the
# trunk itself works end-to-end before wiring in the backend at all. See
# ../README.md "Testing a single outbound call" for the full walkthrough
# including what to look for in the CLI output and CDR.
#
# Usage:
#   ./originate-test-call.sh +91XXXXXXXXXX          # rings internal extension
#   ./originate-test-call.sh +91XXXXXXXXXX ai        # bridges to the AI voice pipeline
#
# Run on the Asterisk server itself (needs the `asterisk` binary + rasterisk
# console access, i.e. run as root or the asterisk user).
set -euo pipefail

NUMBER="${1:?Usage: $0 <number-to-call> [ai]}"
BRIDGE_TARGET="${2:-internal}"

echo "== Originating a call to ${NUMBER} via airtel-trunk, bridge target: ${BRIDGE_TARGET} =="
asterisk -rx "channel originate PJSIP/${NUMBER}@airtel-trunk extension s@outbound-bridge"
echo
echo "Watch the live call: asterisk -rx 'core show channels'"
echo "Watch dialplan execution live: asterisk -rvvv"
echo "Watch recording get written: ls -la \$(asterisk -rx 'dialplan show globals' | awk -F'=' '/RECORDINGS_DIR/{print \$2}')"
