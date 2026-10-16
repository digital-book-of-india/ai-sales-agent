#!/usr/bin/env bash
# Locks down the Asterisk box with ufw. Run once as root after Asterisk is
# installed and pjsip.conf/manager.conf are in place. Idempotent (ufw rules
# are add-if-missing).
#
# Usage:
#   sudo BACKEND_IP=10.0.0.5 AIRTEL_SIP_CIDRS="1.2.3.0/24 5.6.7.0/24" \
#        ./setup-firewall.sh
#
# BACKEND_IP        required. The backend server's IP — the only address
#                    allowed to reach AMI (5038).
# AIRTEL_SIP_CIDRS  optional, space-separated. If set, SIP (5060/udp) and
#                    RTP (10000:10500/udp) are restricted to these CIDRs
#                    instead of "anywhere". Ask Airtel support for their
#                    signaling/media IP ranges — without this the trunk is
#                    reachable from anywhere on UDP 5060/RTP, which is the
#                    normal (if wider) posture for a SIP trunk with
#                    auth_type=userpass protecting it.
set -euo pipefail

if [[ -z "${BACKEND_IP:-}" ]]; then
  echo "ERROR: set BACKEND_IP to the backend server's IP address." >&2
  exit 1
fi

echo "== Default policy: deny incoming, allow outgoing =="
ufw default deny incoming
ufw default allow outgoing

echo "== SSH (adjust the port here if you don't use the default) =="
ufw allow 22/tcp

if [[ -n "${AIRTEL_SIP_CIDRS:-}" ]]; then
  echo "== SIP/RTP restricted to Airtel CIDRs: ${AIRTEL_SIP_CIDRS} =="
  for cidr in ${AIRTEL_SIP_CIDRS}; do
    ufw allow from "${cidr}" to any port 5060 proto udp
    ufw allow from "${cidr}" to any port 10000:10500 proto udp
  done
else
  echo "== SIP/RTP open to any source (no AIRTEL_SIP_CIDRS given) =="
  echo "   auth_type=userpass on the trunk still protects call setup, but"
  echo "   consider asking Airtel for their IP ranges and re-running with"
  echo "   AIRTEL_SIP_CIDRS set."
  ufw allow 5060/udp
  ufw allow 10000:10500/udp
fi

echo "== AMI (5038) — backend IP only, never public =="
ufw allow from "${BACKEND_IP}" to any port 5038 proto tcp

echo "== AudioSocket (9019) — backend IP only =="
ufw allow from "${BACKEND_IP}" to any port 9019 proto tcp

echo "== Recordings HTTP (8088, internal nginx vhost) — backend IP only =="
ufw allow from "${BACKEND_IP}" to any port 8088 proto tcp

ufw --force enable
ufw status verbose
