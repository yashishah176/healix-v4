# Deploying Healix

Healix is one Node process: it serves the built website and the API from the same address. It needs a host that can run a long-lived Node server. It does **not** fit serverless hosting (for example Vercel functions), because local mode saves data to disk and the demo mode keeps state in memory.

## Pick the setup

| Goal | Mode | Keys | Notes |
|---|---|---|---|
| Public demo for judges and recruiters | `DATA_MODE=mock` | Optional | Fake data, resets when the server restarts. Everyone shares one demo world. |
| Real use on one server | `DATA_MODE=local` | Optional | Needs a persistent disk for `LOCAL_DATA_DIR`. Needs a real OTP provider before real patients (see below). |

## Settings (set them in the host's dashboard, not in a file)

```
NODE_ENV=production
PORT=8787                      (many hosts set this for you)
DATA_MODE=mock                 (or local)
AUTH_CODE=424242               (6 digits, required for local mode in production)
SHOW_DEMO_CODE=true            (demo site only: shows the code on the sign-in screens)
STAFF_PHONES=9000000001:karve
GROQ_API_KEY=                  (optional)
GROQ_MODEL=openai/gpt-oss-120b
GROQ_RATE_LIMIT_PER_MINUTE=60  (shared cap on Groq calls)
SARVAM_API_KEY=                (optional)
SARVAM_STT_MODEL=saaras:v3
SARVAM_TTS_MODEL=bulbul:v4-flash
LOCAL_DATA_DIR=/data           (local mode: a persistent disk path)
```

Never commit `server/.env`. Put keys only in the host's secret settings.

## Build and start

```
npm ci
npm run build:web
npm start
```

`npm start` runs in production mode, serves the built site, and adds the security headers. Health check address: `/api/health`.

Local mode refuses to start in production without `AUTH_CODE`.

## What is already protected

- Strict security headers: content policy, no framing, no content sniffing, HTTPS-only hint.
- Request size limits: 1 MB for normal requests, 55 MB for report uploads, 8 MB for voice.
- Rate limits: sign-in guesses per phone number, sign-ups per address, chat messages, uploads, and a shared cap on Groq calls (above it, the built-in answers are used).
- Input limits: chat messages, history length, upload types, zip-bomb guard on Word files.
- Reports can only be opened by their owner. Hospital staff can only reach their own hospital.
- Keys stay on the server. The browser never sees them.
- No secrets in the git history. `npm audit` for production packages: 0 vulnerabilities.

## Known limits (be honest about them)

1. **Sign-in uses one shared code, not a text message.** While `SHOW_DEMO_CODE=true`, anyone who knows a phone number can sign in as it. Use it only with fake data and never upload real reports on a demo site. A real launch needs an SMS or WhatsApp OTP provider.
2. **Demo mode tokens are not secret.** Demo mode is for show only.
3. **Data is stored as plain files** (`state.json`, uploads, `vectors.json`). A real launch needs a database, encryption at rest, backups and a privacy and consent review.
4. **One server, one disk.** No scaling out, no automatic backups.
5. **Rate limits live in memory** and reset on restart. Behind a proxy the visitor address comes from `x-forwarded-for`; use a host that sets it itself.
6. **Doctors and hospitals are sample data.** Triage is rule-based. Hindi and Marathi wording needs a native speaker's review.
7. **Medical disclaimer.** Healix gives guidance, never a diagnosis. Keep that wording visible.

## Before you share the link

- [ ] Open the site in a private window and sign in with the demo code.
- [ ] Run the demo once: symptoms, doctor, token, swap, report, chatbot, Marathi, large text.
- [ ] Check `/api/meta` shows what you expect (`data_mode`, `assistant_mode`).
- [ ] Rotate any key that was ever pasted into a chat.
- [ ] Confirm `server/.env` is not in the repository.
