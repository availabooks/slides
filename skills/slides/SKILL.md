---
name: slides
description: Publish HTML/CSS/JS presentation decks to Slides (slides.availabooks.com). Use when hosting, uploading, sharing, or publishing Reveal.js, impress.js, or any self-contained HTML slides. This skill includes a zero-dependency Node CLI (slides.mjs) for guest and signed-in uploads with custom /d/<name>/ URLs.
---

# Slides — host an HTML deck

**Slides** (`https://slides.availabooks.com`) is a free public host for AI-made HTML/CSS/JS presentation decks. There is no on-site generator. You build the HTML, then upload it and get a permanent public URL.

Live skill: `https://slides.availabooks.com/skills/slides/SKILL.md`
CLI (same package): `https://slides.availabooks.com/skills/slides/slides.mjs`
Zip of this folder: `https://slides.availabooks.com/skills/slides.zip`
Discovery: `https://slides.availabooks.com/llms.txt`

This skill **is** the package. The folder contains:

| File | Purpose |
| --- | --- |
| `SKILL.md` | This document |
| `slides.mjs` | Node 18+ CLI (no npm dependencies) |
| `package.json` | Optional `bin` so `npx slides` works from this folder |

Download the zip and unpack it — you get a `slides/` directory with those files. Drop that folder into Cursor skills (or your agent’s skill path). If this skill is already on disk, run `node slides.mjs` from this directory. If you only fetched the markdown, download the sibling CLI from the same origin (see **CLI** below).

## When to use this

Use this skill whenever the user wants to:

- Share a slide deck, talk, or demo as a link
- Host Reveal.js, impress.js, or a hand-written HTML presentation
- Publish HTML/CSS/JS slides without GitHub Pages, Netlify, or a zip attachment
- Choose a **custom URL** like `/d/my-talk/` (requires signing the user in)

Do **not** invent other endpoints. Call only `slides.availabooks.com` (or a `--host` the user gave). Never call WorkOS directly.

## Default: guest paste (no account)

If the user did **not** ask for a custom URL, upload as a guest. That is one `POST`. No API key, no sign-in.

```bash
curl -sS -X POST https://slides.availabooks.com/api/upload \
  -F mode=paste \
  -F html=@deck.html
```

Inline HTML also works:

```bash
curl -sS -X POST https://slides.availabooks.com/api/upload \
  -F mode=paste \
  -F html='<!doctype html><html><head><meta charset="utf-8"><title>Demo</title></head><body><h1>Hello</h1></body></html>'
```

CORS is enabled on upload and Magic Auth, so browser tools may call them from other origins.

### Success (HTTP 201)

```json
{
  "id": "AbCdEf123",
  "slug": null,
  "url": "https://slides.availabooks.com/d/AbCdEf123/"
}
```

Give the user `url`. Open it with a trailing slash. The deck stays public until an owner unpublishes it (guests cannot unpublish).

### Failures

| Status | Meaning |
| --- | --- |
| 400 | Missing `html` / files / zip, invalid `mode`, invalid `slug`, or no `index.html` |
| 401 | Custom `slug` sent without `Authorization: Bearer` (or session cookie) |
| 409 | Custom slug already taken |
| 413 | Upload larger than ~10MB |

Error body: `{ "error": "..." }`.

## Custom URL (`/d/<name>/`)

Signed-in users may send `slug` (`^[a-z][a-z0-9-]{1,31}$`) to publish at `/d/<slug>/` as well as `/d/<id>/`. Guests sending `slug` get `401`.

Reserved slugs: `api`, `d`, `upload`, `sign-in`, `decks`, `pricing`, `assets`, `www`.

### Sign the user in, then upload

Magic Auth emails a **6-digit code**. You must **ask the user for that code**. Never invent, guess, or skip it. The start endpoint never returns the code.

1. Ask the user for the email they want on the account (and the slug they want, e.g. `my-talk`).
2. Start:

```bash
curl -sS -X POST https://slides.availabooks.com/api/auth/magic/start \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

HTTP `204` means the email was sent. If this is a non-interactive run, stop and tell the user to reply with the code.

3. Ask: “Check your inbox for a 6-digit Slides code and paste it here.”
4. Verify (saves a session token — also sets a cookie for browsers):

```bash
curl -sS -X POST https://slides.availabooks.com/api/auth/magic/verify \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}'
```

Success (HTTP 200):

```json
{
  "session": "<opaque token>",
  "user": { "email": "you@example.com" }
}
```

Keep `session` for this user. Do not print the full token back unless they need it.

5. Upload with the token and slug:

```bash
curl -sS -X POST https://slides.availabooks.com/api/upload \
  -H "Authorization: Bearer $SESSION" \
  -F mode=paste \
  -F html=@deck.html \
  -F slug=my-talk
```

Success includes `"slug": "my-talk"` and `"url": "https://slides.availabooks.com/d/my-talk/"`.

Reuse a stored session on later uploads (`Authorization: Bearer` plus `-F slug=...`). If verify or upload returns 401, sign in again.

Optional check:

```bash
curl -sS https://slides.availabooks.com/api/me \
  -H "Authorization: Bearer $SESSION"
```

`{ "authenticated": true, "user": { "id", "email" } }` means the token is still good.

### Rename an existing deck (owner only)

```bash
curl -sS -X PATCH https://slides.availabooks.com/api/decks/$DECK_ID \
  -H "Authorization: Bearer $SESSION" \
  -H 'Content-Type: application/json' \
  -d '{"slug":"my-talk"}'
```

Pass `"slug": null` (or `""`) to drop the custom name. The random `/d/<id>/` link still works.

## CLI

The CLI ships **in this skill** (`slides.mjs`). Node 18+ is enough — do not `npm install` the host app, and do not clone the repo just to upload.

To get the whole folder (this file, the CLI, and `package.json`):

```bash
curl -fsSL -o slides.zip https://slides.availabooks.com/skills/slides.zip
unzip slides.zip
node slides/slides.mjs --help
```

From this skill directory:

```bash
node slides.mjs upload deck.html
node slides.mjs login --email you@example.com
node slides.mjs upload deck.html --slug my-talk
node slides.mjs slug AbCdEf123 --slug my-talk
node slides.mjs whoami
```

If you only have this markdown (or a remote agent), fetch the CLI next to the deck:

```bash
curl -fsSL -o slides.mjs https://slides.availabooks.com/skills/slides/slides.mjs
chmod +x slides.mjs
node slides.mjs --help
node slides.mjs upload deck.html --slug my-talk
```

Guest uploads omit `--slug`. Custom URLs need a session: run `login` first, or pass `--email` and `--code` on `upload`.

Non-interactive (agents):

```bash
node slides.mjs login --email you@example.com
# exit 2: "re-run with --code"
node slides.mjs login --email you@example.com --code 123456
node slides.mjs upload deck.html --slug my-talk
```

Session file: `~/.slides/session` (mode 0600). Overrides: `SLIDES_SESSION`, `SLIDES_SESSION_FILE`, `SLIDES_HOST`.

From a clone of this repo, `npx slides` is the same file (`skills/slides/slides.mjs`).

## Multipart fields

`Content-Type` must be `multipart/form-data` (curl `-F` does this). JSON bodies are not accepted for upload.

| Field | Required | Notes |
| --- | --- | --- |
| `mode` | yes | `paste`, `files`, or `zip` |
| `html` | if `paste` | Full HTML document. File (`html=@deck.html`) or string. |
| `files` | if `files` | Repeat the field for each file. Must include `index.html`, or a **single** `.html` file (renamed to `index.html`). |
| `zip` | if `zip` | `.zip` of the deck. Prefer `index.html` at the **archive root**. If the zip has exactly one `.html` file, it is used as `index.html`. |
| `slug` | no | Signed-in only (`Authorization: Bearer` or session cookie). Pattern `^[a-z][a-z0-9-]{1,31}$`. |

## Files and zip

```bash
# Several files including index.html (and maybe css/js/images)
curl -sS -X POST https://slides.availabooks.com/api/upload \
  -F mode=files \
  -F files=@index.html \
  -F files=@styles.css \
  -F files=@app.js

# Zip
curl -sS -X POST https://slides.availabooks.com/api/upload \
  -F mode=zip \
  -F zip=@deck.zip
```

Keep asset URLs **relative** (`./styles.css`, `assets/chart.png`). Absolute paths like `/styles.css` will 404 on the hosted deck.

Do not upload `_meta.json`. Nested `..` path segments are stripped.

## HTML that hosts well

- One self-contained document is enough: CSS/JS in `<style>` / `<script>`, or extra files with relative paths.
- Include `<!doctype html>`, a `<title>` (used as the deck title), and a viewport meta tag.
- CDN scripts (Reveal, fonts) are fine if the user’s viewers can reach them.
- Size limit is ~10MB for the whole upload.

## What not to do

- Do not call WorkOS. Only `slides.availabooks.com` `/api/auth/magic/start` and `/verify`.
- Do not invent the 6-digit email code or tell the user to scrape WorkOS.
- Do not assume a JSON upload API, S3 URLs, or API keys.
- Do not tell the user they must create an account to get a link — guests get `/d/<id>/`.
- Do not send `slug` until you have a session.
- Do not put secrets in the HTML you upload; decks are public.
