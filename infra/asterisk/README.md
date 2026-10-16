# Asterisk + Airtel SIP trunk — dialer PBX

Self-hosted Asterisk (PJSIP) PBX on a Linux server, trunked to Airtel, controlled
by the NestJS backend over AMI. Replaces the earlier Exotel-based telephony
integration — see `backend/src/calling/telephony/asterisk.provider.ts` for the
`TelephonyProvider` implementation this config is paired with.

## Layout

```
infra/asterisk/
  etc/asterisk/
    pjsip.conf                       # transport + includes (no secrets, commit as-is)
    pjsip.airtel_trunk.conf.example  # Airtel trunk TEMPLATE — copy, fill in, DO NOT commit the copy
    pjsip.internal.conf.example      # internal extension TEMPLATE — same deal
    extensions.conf                  # dialplan (no secrets, commit as-is)
    manager.conf                     # AMI general settings (no secrets, commit as-is)
    manager.d/backend.conf.example   # AMI backend-user TEMPLATE — copy, fill in, DO NOT commit the copy
    rtp.conf                         # RTP port range
  firewall/setup-firewall.sh         # ufw lockdown script
  nginx/recordings-internal.conf     # internal-only recording playback vhost
  scripts/
    originate-test-call.sh           # place a test call from the Asterisk CLI
    ami-originate-test.sh            # place a test call over raw AMI (bash+nc)
```

Anything ending in `.example` is a template — copy it (dropping `.example`)
and fill in real values **on the server itself**. The real files are
git-ignored (see `infra/asterisk/.gitignore`); never paste real Airtel or AMI
credentials into a chat, ticket, or commit.

## Deploying

On a fresh Debian/Ubuntu server (adjust for your distro):

```bash
sudo apt update
sudo apt install -y asterisk nginx-full   # nginx-full (not nginx-light) — needed for secure_link, see below

# Copy this whole infra/asterisk/etc/asterisk/ tree onto the box, e.g.:
sudo cp infra/asterisk/etc/asterisk/*.conf /etc/asterisk/
sudo mkdir -p /etc/asterisk/manager.d
sudo cp infra/asterisk/etc/asterisk/manager.d/backend.conf.example /etc/asterisk/manager.d/

# Now fill in the real values (see each file's own header comment):
cd /etc/asterisk
sudo cp pjsip.airtel_trunk.conf.example pjsip.airtel_trunk.conf
sudo cp pjsip.internal.conf.example pjsip.internal.conf
sudo cp manager.d/backend.conf.example manager.d/backend.conf
sudo $EDITOR pjsip.airtel_trunk.conf   # Airtel host/port/username/password/DID
sudo $EDITOR pjsip.internal.conf       # internal extension password
sudo $EDITOR manager.d/backend.conf    # AMI secret + backend IP

sudo chown asterisk:asterisk pjsip.airtel_trunk.conf pjsip.internal.conf manager.d/backend.conf
sudo chmod 640 pjsip.airtel_trunk.conf pjsip.internal.conf manager.d/backend.conf

sudo mkdir -p /var/spool/asterisk/recordings
sudo chown asterisk:asterisk /var/spool/asterisk/recordings

sudo systemctl restart asterisk
sudo asterisk -rx "pjsip show endpoints"   # should list airtel-trunk and 1001
sudo asterisk -rx "pjsip show registrations"  # should show airtel-registration as Registered, if your trunk uses REGISTER
```

nginx (internal-only recordings vhost):

```bash
sudo cp infra/asterisk/nginx/recordings-internal.conf /etc/nginx/sites-available/recordings-internal
sudo $EDITOR /etc/nginx/sites-available/recordings-internal
# - set `allow` to the backend server's real IP
# - replace ASTERISK_RECORDINGS_SECRET with the same value backend/.env's
#   ASTERISK_RECORDINGS_SECRET has
sudo ln -s /etc/nginx/sites-available/recordings-internal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Firewall (see the script's own header for `AIRTEL_SIP_CIDRS`):

```bash
sudo BACKEND_IP=10.0.0.9 infra/asterisk/firewall/setup-firewall.sh
```

Backend side: set `TELEPHONY_PROVIDER=asterisk` and every `ASTERISK_*` /
`AUDIOSOCKET_*` value in `backend/.env` (see `backend/.env.example` for the
full list with explanations) to match what you just configured here, then
restart the backend.

## Config files changed, exactly

| File (on the Asterisk server) | What it does |
|---|---|
| `/etc/asterisk/pjsip.conf` | UDP transport on 5060, includes the two files below |
| `/etc/asterisk/pjsip.airtel_trunk.conf` | Airtel trunk auth/aor/registration/identify/endpoint |
| `/etc/asterisk/pjsip.internal.conf` | Internal extension(s) for a human softphone |
| `/etc/asterisk/extensions.conf` | Inbound/outbound dialplan (see below) |
| `/etc/asterisk/manager.conf` | AMI general settings, bound to an internal address only |
| `/etc/asterisk/manager.d/backend.conf` | AMI backend user — secret + IP allowlist |
| `/etc/asterisk/rtp.conf` | RTP port range (10000-10500) |
| `/etc/asterisk/http.conf` | HTTP/TLS server — only needed for the WSS softphone, see "Browser softphone" below |
| `/etc/nginx/sites-available/recordings-internal` | Internal-only signed-URL recording playback |

## Call flow

- **Outbound (the dialer)**: `AsteriskProvider.initiateCall()` sends an AMI
  `Originate` action with `Channel: PJSIP/<number>@airtel-trunk`,
  `Context: outbound-bridge`, `ChannelId: <generated UUID>` — that UUID
  becomes both the Asterisk channel's Uniqueid *and* `Call.providerCallId` in
  Postgres, so no separate id-mapping table is needed anywhere in this
  system. `[outbound-bridge]` in extensions.conf starts `MixMonitor`
  (recording), then bridges to `[ai-bridge]` (AI voice pipeline, via
  AudioSocket) or `[internal-ring]` (rings extension 1001) depending on
  whether the campaign has an AI agent configured.
- **Inbound (Airtel → us)**: lands in `[from-airtel]`, generates its own call
  UUID via Asterisk's `UUID()` dialplan function, records, then routes the
  same way based on the `INBOUND_DESTINATION` global.
- **Recording**: `MixMonitor` writes `<uuid>.wav` to
  `/var/spool/asterisk/recordings/` on every leg that reaches either bridge
  target. `AsteriskProvider.getRecording()` builds a short-lived
  `nginx secure_link`-signed URL to that file — same "signed URL" pattern
  `RecordingsService` already uses for its own `/stream` endpoint, one layer
  further down.
- **AMI**: full call control (originate/hangup/redirect) plus the live event
  feed (Newchannel/Newstate/Hangup) `AsteriskProvider` listens on to push
  status updates straight into `CallsService` — there's no HTTP webhook for
  Asterisk, unlike the old Exotel integration.

## Browser softphone (click-to-call)

Sales reps place calls from the app itself (Leads list / Lead Detail "Call"
button — see `frontend/src/calling/softphone.ts`) via a WebRTC softphone
(SIP.js) that registers over a WebSocket transport, not a physical desk
phone. Extra setup beyond the base deploy above:

1. **Enable Asterisk's HTTP server with TLS** — WSS needs a real (non
   self-signed) certificate, since browsers refuse to open a WebSocket to an
   untrusted TLS host. In `/etc/asterisk/http.conf`:
   ```ini
   [general]
   enabled=yes
   tlsenable=yes
   tlsbindaddr=0.0.0.0:8089
   tlscertfile=/etc/asterisk/keys/asterisk.pem
   tlsprivatekey=/etc/asterisk/keys/asterisk.key
   ```
2. **Uncomment `[transport-wss]`** in `pjsip.conf` (see that file's own
   comment block for the full explanation).
3. **Give each rep's extension `webrtc=yes` / `transport=transport-wss`** —
   already set on the example `[1001]` extension in
   `pjsip.internal.conf.example`.
4. **Set the extension's password on the User row**, not just in
   `pjsip.internal.conf` — `User.sipExtension` was added in Prompt B;
   `User.sipPassword` (Prompt C) must hold the *same* password as this
   extension's `[NNNN-auth]` stanza, since the browser's SIP stack needs the
   plaintext value to answer Asterisk's digest challenge. The demo seed sets
   it via `SEED_SIP_PASSWORD` (`backend/prisma/seed.ts`); for a real user, set
   it directly in Postgres.
5. **Fill in `ASTERISK_WSS_URI` / `ASTERISK_SIP_DOMAIN`** in `backend/.env` —
   unlike every other `ASTERISK_*` var, `ASTERISK_WSS_URI` is intentionally
   exposed to the frontend (via `GET /users/me/sip-credentials`), so it must
   be the box's public `wss://` URL, not an internal IP.

With all five in place, `GET /users/me/sip-credentials` (authenticated,
scoped to the caller) returns `{ extension, password, uri, wsServers }`, and
the "Call" button's flow is: request mic permission → SIP.js registers using
those credentials → `POST /leads/:id/call` originates the PSTN leg exactly
like `AsteriskProvider.initiateCall()` does for a MANUAL AI-dialer call (see
`backend/src/calling/manual-call.service.ts`) → once the lead answers,
`[internal-ring]` in extensions.conf rings this same extension, and the
browser softphone auto-answers (the rep already committed to the call by
clicking "Call", so there's no second accept prompt).

Nothing here changes call recording, transcription, or CRM updates — Prompt
C's calls flow through the exact same `CallsService`/`RecordingsService` code
an AI-dialed call does; only `callMode`/`salesUserId` on the `Call` row and
who gets bridged to differ.

## Security

Three independent layers, each redundant with the others — losing any one
still leaves AMI/recordings closed:

1. **`manager.conf` `bindaddr`** — AMI listens on an internal address only,
   never `0.0.0.0` or a public IP.
2. **`manager.d/backend.conf` `permit`/`deny`** — even on the internal
   network, only the backend server's exact IP may authenticate.
3. **Firewall** (`firewall/setup-firewall.sh`) — port 5038 (AMI), 9019
   (AudioSocket), and 8088 (recordings nginx) are only reachable from the
   backend server's IP at the network layer, regardless of what's bound where.

The same reasoning applies in the other direction for AudioSocket: it's
Asterisk connecting *out* to the backend, so the backend's own firewall/
security group must restrict inbound 9019 to the Asterisk server's IP, and
`ASTERISK_SERVER_IPS` in `backend/.env` is a second, in-process check on top
of that (see `AudioSocketGateway`).

**Never commit real credentials.** Every file that holds one is `.example`
in git and the real copy is git-ignored (`infra/asterisk/.gitignore`) — see
"Deploying" above.

## Testing a single outbound call end-to-end

**1. Trunk registration is up** (skip if your Airtel trunk is IP-authenticated,
no REGISTER):
```bash
asterisk -rx "pjsip show registrations"
# Expect: airtel-registration ... Registered
```

**2. Place a test call straight from the Asterisk CLI** — no backend involved,
proves the trunk + dialplan work in isolation:
```bash
cd infra/asterisk/scripts
./originate-test-call.sh +91XXXXXXXXXX          # bridges to internal extension 1001
./originate-test-call.sh +91XXXXXXXXXX ai        # bridges to the AI voice pipeline instead
```
Watch it live in another terminal: `asterisk -rvvv` (verbose console) or
`asterisk -rx "core show channels"`. You should see the trunk send an
INVITE, the number ring, and — once answered — either extension 1001 ring
(`internal` target) or an `AudioSocket(...)` connect attempt to
`AI_AUDIOSOCKET_SERVICE` (`ai` target; expect this to fail if the backend
isn't running yet, that's fine for this step).

Check the recording landed:
```bash
ls -la /var/spool/asterisk/recordings/
```

**3. Same test, over raw AMI** — proves the exact protocol path the backend
uses, without running the backend:
```bash
AMI_USER=backend AMI_SECRET=<the secret from manager.d/backend.conf> \
  ./ami-originate-test.sh +91XXXXXXXXXX internal
```

**4. End-to-end through the backend**: set `TELEPHONY_PROVIDER=asterisk` in
`backend/.env`, start the backend, and either trigger a real dial through the
app (create a campaign + lead, let the dialer queue pick it up) or call
`AsteriskProvider.initiateCall()` directly from a REPL/test script. Confirm:
- The call log shows a `Call` row with a `providerCallId` (the UUID) and
  status transitioning `INITIATED` → `RINGING` → `IN_PROGRESS` → `COMPLETED`
  (or `NO_ANSWER`/`BUSY`/`FAILED`) — these come from `AsteriskProvider`'s AMI
  event listener pushing into `CallsService.applyStatusUpdate`, not a webhook.
- If the campaign has an AI agent: `asterisk -rvvv` shows the
  `AudioSocket()` dialplan line connecting, and the backend log shows
  `AudioSocketGateway` receiving the initial uuid packet and starting a
  voice session.
- After the call ends: a `Recording` row appears (via
  `RecordingsService.enqueueFetch` → `AsteriskProvider.getRecording()`), and
  it's playable from the app.

## Tests

Automated coverage lives next to the code, not in this directory:

- `backend/src/calling/telephony/ami-client.spec.ts` — AMI wire protocol
  (Login handshake, Action/Response correlation, repeated `Variable:`
  headers, event dispatch, timeouts) against a fake socket.
- `backend/src/calling/telephony/asterisk.provider.spec.ts` — Originate
  construction, AI-vs-internal bridge routing, AMI-event-driven status
  pushes into `CallsService`, hangup/transfer channel resolution, signed
  recording URL generation.
- `backend/src/calling/ai-voice/audiosocket-protocol.spec.ts` — AudioSocket
  packet framing (uuid/audio/dtmf/terminate/error, partial-buffer handling).
- `backend/src/calling/ai-voice/audiosocket.gateway.spec.ts` — connection IP
  allowlisting, packet-to-voice-session wiring, end-to-end wire framing.

Run them with `npm test` from `backend/` (or `npx jest telephony ai-voice`
to scope it to just these).
