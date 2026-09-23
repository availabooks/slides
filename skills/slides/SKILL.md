---
name: slides
description: Publish HTML/CSS/JS presentation decks to Availabooks Slides (app.availabooks.com/slides). Use when hosting, uploading, sharing, or publishing Reveal.js, impress.js, or any self-contained HTML slides. Requires an Availabooks account. This skill includes a zero-dependency Node CLI (slides.mjs).
---

# Slides — host an HTML deck

**Slides** (`https://app.availabooks.com/slides`) hosts AI-made HTML/CSS/JS presentation decks. There is no on-site generator. You build the HTML, sign in with an Availabooks account, then upload and get a permanent public URL.

Live skill: `https://app.availabooks.com/slides/skills/slides/SKILL.md`
CLI (same package): `https://app.availabooks.com/slides/skills/slides/slides.mjs`
Zip of this folder: `https://app.availabooks.com/slides/skills/slides.zip`
Discovery: `https://app.availabooks.com/slides/llms.txt`

This skill **is** the package. The folder contains:

| File | Purpose |
| --- | --- |
| `SKILL.md` | This document |
| `slides.mjs` | Node 18+ CLI (no npm dependencies) |
| `package.json` | Optional `bin` so `npx slides` works from this folder |

Download the zip and unpack it — you get a `slides/` directory with those files. Drop that folder into Cursor skills (or your agent’s skill path). If this skill is already on disk, run `node slides.mjs` from this directory.

## When to use this

Use this skill whenever the user wants to:

- Share a slide deck, talk, or demo as a link
- Host Reveal.js, impress.js, or a hand-written HTML presentation
- Publish HTML/CSS/JS slides without GitHub Pages, Netlify, or a zip attachment
- Choose a **custom URL** like `/slides/d/my-talk/`

Do **not** invent other endpoints. Call only `app.availabooks.com` (or a `--host` the user gave). Never call WorkOS directly.

## Auth required

Every upload needs an Availabooks session. **Prefer browser login** (default). Do **not** pass `--email` unless the user asks for headless Magic Auth.

```bash
curl -fsSL -o slides.mjs https://app.availabooks.com/slides/skills/slides/slides.mjs
node slides.mjs login
# finish sign-in in the browser, then:
node slides.mjs upload deck.html --slug my-talk
```

What `slides login` does (no `--email`):

1. Starts a temporary `http://127.0.0.1:<port>/callback` server
2. Opens the system browser to Availabooks `/login` (password or Magic Auth UI)
3. After sign-in, the app redirects to that localhost callback with a short-lived code
4. The CLI exchanges the code for a session cookie and saves it to `~/.slides/session`

Tell the user to finish signing in in the browser. Do not invent passwords or email codes.

Optional Magic Auth (headless / no browser only):

```bash
node slides.mjs login --email you@example.com
```

1. `POST /api/auth/magic/send` with JSON `{ "email" }` and header `Origin: https://app.availabooks.com`
2. Ask the user for the 6-digit code (never invent it)
3. `POST /api/auth/magic/verify` with `{ "email", "code" }` and the same `Origin`
4. From `Set-Cookie`, keep a **live** session cookie (skip any with `Max-Age=0`). Prefer `availabook-course-<courseId>=…` when present; otherwise `availabooks-app-session=…`

### Host / share URL

Default host is `https://app.availabooks.com`. Pass `--host` (or set `SLIDES_HOST`) for local/staging, e.g. `--host https://local.availabooks.com:2732`. The share URL the CLI prints is for **that same host**. A deck uploaded locally is not on production.

## Upload

```bash
curl -sS -X POST https://app.availabooks.com/slides/api/upload \
  -H "Origin: https://app.availabooks.com" \
  -H "Cookie: $SESSION_COOKIE" \
  -F mode=paste \
  -F html=@deck.html \
  -F slug=my-talk
```

`$SESSION_COOKIE` is the full `name=value` pair from the saved session (example `availabooks-app-session=…` or `availabook-course-org_abc=…`).

Success (201): `{ "id", "slug", "url" }`. Give the user `url` (example `https://app.availabooks.com/slides/d/<id>/`).

Modes: `paste` (field `html`), `files` (repeat field `files`, include `index.html`), `zip` (field `zip`). Max ~10MB.

Custom slugs: `^[a-z][a-z0-9-]{1,31}$`. Reserved: `api`, `d`, `upload`, `sign-in`, `decks`, `pricing`, `assets`, `www`, `slides-host`, `skills`.

### Failures

| Status | Meaning |
| --- | --- |
| 400 | Missing `html` / files / zip, invalid `mode`, invalid `slug`, or no `index.html` |
| 401 | Not signed in |
| 403 | Forbidden origin or not the deck owner |
| 409 | Custom slug already taken |
| 413 | Upload larger than ~10MB |

## Deck viewing

Published decks are public at `https://app.availabooks.com/slides/d/<id-or-slug>/`. No auth required to view.

## CLI

```bash
node slides.mjs login
node slides.mjs login --email you@example.com   # headless Magic Auth only
node slides.mjs whoami
node slides.mjs upload deck.html
node slides.mjs upload deck.html --slug my-talk
node slides.mjs upload deck.html --slug my-talk --host https://local.availabooks.com:2732
node slides.mjs slug <deck-id> --slug new-name
node slides.mjs logout
```

Environment: `SLIDES_HOST` (default `https://app.availabooks.com`), `SLIDES_SESSION` (`name=value` or bare legacy token), `SLIDES_SESSION_FILE`.

Do not invent other publish APIs. Do not call WorkOS directly.
