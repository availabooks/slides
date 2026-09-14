Slides — Cloudflare Workers app
===============================

Free host for AI‑made HTML/CSS/JS presentation decks.

- Guests and signed‑in users can paste HTML, upload multiple files, or upload a zip to get a permanent public URL `/d/<id>/`
- Signed‑in users can also pick a custom slug like `/d/welcome/`
- Links never expire; owners can unpublish
- Guests: upload → link, no library
- Signed‑in: passwordless email via WorkOS Magic Auth (custom UI), "My decks" list, unpublish

Public source: https://github.com/availabooks/slides

For AI agents
-------------

Other agents can publish a deck with one unauthenticated POST. No API key.

- Live skill: https://slides.availabooks.com/skills/slides/SKILL.md
- Discovery file: https://slides.availabooks.com/llms.txt
- Canonical copy in this repo: `skills/slides/SKILL.md`

```
curl -sS -X POST https://slides.availabooks.com/api/upload \
  -F mode=paste \
  -F html=@deck.html
```

`201` body: `{ "id", "slug", "url" }`. Give the user `url`. Modes are `paste` (`html`), `files` (repeat `files`, include `index.html`), and `zip` (`zip`). Max ~10MB. Custom `slug` is signed-in only — guests must omit it.

WorkOS app separation
---------------------

- Do NOT reuse any existing Availabooks or Blogger WorkOS application.
- Create a brand‑new WorkOS application named, for example, “AI Slides Hoster”.
- Use that app’s credentials exclusively in this project.
- WorkOS is used only to mint and verify Magic Auth codes. We send our own email via Cloudflare Email Service (not Resend, not WorkOS).
- In the **AI Slides Hoster** WorkOS project, Magic Auth emails must stay **off**: Emails → Configuration → disable Magic Auth. If this is left on (or you use the Availabooks/Blogger WorkOS app), users get a generic WorkOS email instead of ours.
- Do not call WorkOS `magic_auth/send` or `send_code`. Create the code with `POST /user_management/magic_auth`, then authenticate with `POST /user_management/authenticate` (`grant_type: urn:workos:oauth:grant-type:magic-auth:code`).
- Two WorkOS apps for this product:
  - **Staging** client ID: `client_01M2B1F1C2VS1HFTYA4N9GQJ6K` (local `wrangler dev` via `.dev.vars`)
  - **Production** client ID: `client_01M2B1JYJQSP6BTSC4YV99QB77` (set in `wrangler.jsonc` `vars`)
- API keys stay out of git: staging `sk_test_…` in `.dev.vars`; production `sk_…` via `wrangler secret put WORKOS_API_KEY`.

Production hosting
------------------

- Production URL (Availabooks account): https://slides.availabooks.com
- Lives under the Availabooks Cloudflare account.
- When accessed at `slides.availabooks.com`, API responses return absolute share links like `https://slides.availabooks.com/d/<id>/`. In local dev, links remain relative (`/d/<id>/`).

Stack
-----

- One Cloudflare Worker with Static Assets (NOT Pages)
- R2 only for files and metadata — no database
- WorkOS Magic Auth API for passwordless email (custom UI, no hosted pages)
- TypeScript, npm
- Vite SPA in `web/` builds to `dist/`; Worker in `src/worker/`
- `wrangler.jsonc` sets `assets.directory = dist`, `compatibility_date: 2026-09-12`, `compatibility_flags: ["nodejs_compat"]`
- Custom domain is configured via Workers Routes/Custom Domains. `wrangler.jsonc` includes:
  - `routes: [{ "pattern": "slides.availabooks.com", "custom_domain": true }]`
  - `workers_dev: true` (dev convenience; the custom domain is the real entry)

R2 layout
---------

```
d/<deckId>/index.html
d/<deckId>/...assets...
d/<deckId>/_meta.json  { id, ownerUserId, createdAt, title, entry, slug }
users/<userId>/decks/<deckId>  pointer for listing
slugs/<slug>  pointer to deckId (signed-in custom URLs only)
```

Getting started (local)
-----------------------

Prereqs:
- Node 18+ and npm
- Cloudflare `wrangler` (installed via devDependency)

1) Install deps and build the SPA
```
npm install
npm run build
```

2) Configure local R2 and required bindings

Wrangler will create a preview R2 bucket automatically for `dev`. Production uses `deckdrop-decks`; preview uses `deckdrop-decks-dev` (see `wrangler.jsonc`).

3) Secrets (only needed for auth; uploads work without them)

Set the following in your environment. For production, use `wrangler secret put`:
```
wrangler secret put WORKOS_API_KEY
wrangler secret put SESSION_SECRET
# Optional:
wrangler secret put EMAIL_LOGO_URL
```

`WORKOS_CLIENT_ID` and `EMAIL_FROM` for production are already in `wrangler.jsonc` (`vars`). You do not need a Resend (or any third-party mail) API key.

For local `dev`, copy `.dev.vars.example` to `.dev.vars` and use the **staging** WorkOS app:
```
WORKOS_API_KEY=<staging sk_test_…>
WORKOS_CLIENT_ID=client_01M2B1F1C2VS1HFTYA4N9GQJ6K
SESSION_SECRET=... # any long random string
EMAIL_FROM="Slides <auth@slides.availabooks.com>"
# Optional:
# EMAIL_LOGO_URL=https://slides.availabooks.com/logo.png
```

Important: Use credentials from the dedicated AI Slides Hoster WorkOS apps (staging locally, production on deploy), not any other product’s keys. Never commit API keys.

4) Run locally
```
npm run dev
```

This starts a local dev server with:
- Static assets served from `dist/`
- Worker handling:
  - `GET /d/:id` and `GET /d/:id/*` — serve from R2 (never `_meta.json`). Custom slugs like `/d/welcome/` resolve via `slugs/<slug>`.
  - `POST /api/upload` — multipart (paste|files|zip), optional `slug` for signed-in users, ~10MB limit
  - `GET /api/me`
  - `POST /api/auth/magic/start` `{ email }` — WorkOS Magic Auth (returns 503 if `WORKOS_API_KEY` missing)
  - On magic/start, the Worker calls WorkOS to create a code, then sends a custom branded email via Cloudflare Email Service (`send_email` binding). The code is never returned over HTTP.
  - `POST /api/auth/magic/verify` `{ email, code }` — WorkOS verifies the code; on success sets httpOnly `ai_slides_session` cookie (HMAC with `SESSION_SECRET`)
  - `POST /api/auth/logout`
  - `GET /api/decks` — list for signed‑in user
  - `PATCH /api/decks/:id` `{ slug }` — owner only; set or clear a custom URL
  - `DELETE /api/decks/:id` — owner only

Deploy
------

Provision the R2 bucket `deckdrop-decks` in your Cloudflare account, then:
```
wrangler r2 bucket create deckdrop-decks
wrangler deploy
```

Configure production secrets in Cloudflare (production WorkOS API key, not staging):
```
wrangler secret put WORKOS_API_KEY
wrangler secret put SESSION_SECRET
```

Production `WORKOS_CLIENT_ID` is `client_01M2B1JYJQSP6BTSC4YV99QB77` via `wrangler.jsonc` vars. `EMAIL_FROM` defaults to `Slides <auth@slides.availabooks.com>`.

Email sending (Cloudflare Email Service)
---------------------------------------

There is no Resend key. Sign-in codes are sent with the Worker `EMAIL` binding.

1. In the Availabooks Cloudflare dashboard: **Compute → Email Service → Email Sending → Onboard Domain**.
2. Onboard `availabooks.com` (Cloudflare DNS). Cloudflare adds SPF / DKIM / DMARC (and bounce MX on `cf-bounce`).
3. Sending to arbitrary inboxes is **Email Sending** (Workers Paid). Sending only to addresses you verified in Email Routing is free, but that is not enough for public sign-in.
4. After DNS settles, `POST /api/auth/magic/start` sends from `auth@slides.availabooks.com`.
5. Local `wrangler dev` may not deliver real mail unless you use remote email bindings (`wrangler dev --remote` or Wrangler 4 `send_email.remote`). Production deploy is the reliable path.

Attach the custom domain
------------------------

- Preferred (Dashboard): Cloudflare Dashboard → Workers & Pages → select this Worker → Custom Domains → Add → `slides.availabooks.com`. This creates the route and DNS record in the Availabooks zone.
- Alternative: `wrangler.jsonc` already attaches the hostname as a Workers custom domain:
  ```
  "routes": [{ "pattern": "slides.availabooks.com", "custom_domain": true }]
  ```
  `wrangler deploy` creates the custom domain in the Availabooks zone. The zone `availabooks.com` must already exist in that account.

Notes
-----

- Deck IDs are short URL‑safe strings. Owners can unpublish (delete) decks they own; guests cannot.
- Authentication uses WorkOS Magic Auth API with a custom UI — no hosted AuthKit pages are used.
- The Worker runs first and falls back to static assets; the SPA uses client‑side routing with single‑page‑application fallback for unknown paths.
