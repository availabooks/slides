---
name: slides
description: Publish HTML/CSS/JS presentation decks to Slides (slides.availabooks.com). Use when hosting, uploading, sharing, or publishing Reveal.js, impress.js, or any self-contained HTML slides. Guest POST to /api/upload — no account required.
---

# Slides — host an HTML deck

**Slides** (`https://slides.availabooks.com`) is a free public host for AI-made HTML/CSS/JS presentation decks. There is no on-site generator. You build the HTML, then upload it and get a permanent public URL.

Live skill: `https://slides.availabooks.com/skills/slides/SKILL.md`
Discovery: `https://slides.availabooks.com/llms.txt`

## When to use this

Use this skill whenever the user wants to:

- Share a slide deck, talk, or demo as a link
- Host Reveal.js, impress.js, or a hand-written HTML presentation
- Publish HTML/CSS/JS slides without GitHub Pages, Netlify, or a zip attachment

Do **not** invent other endpoints. The upload API below is the whole publish path for agents.

## Default: guest paste (no account)

Most agents should upload as a guest. That is one `POST`. No API key, no sign-in.

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

CORS is enabled on `POST /api/upload`, so browser tools may call it from other origins.

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
| 400 | Missing `html` / files / zip, invalid `mode`, or no `index.html` |
| 401 | Custom `slug` sent without a session cookie |
| 409 | Custom slug already taken |
| 413 | Upload larger than ~10MB |

Error body: `{ "error": "..." }`.

## Multipart fields

`Content-Type` must be `multipart/form-data` (curl `-F` does this). JSON bodies are not accepted.

| Field | Required | Notes |
| --- | --- | --- |
| `mode` | yes | `paste`, `files`, or `zip` |
| `html` | if `paste` | Full HTML document. File (`html=@deck.html`) or string. |
| `files` | if `files` | Repeat the field for each file. Must include `index.html`, or a **single** `.html` file (renamed to `index.html`). |
| `zip` | if `zip` | `.zip` of the deck. Prefer `index.html` at the **archive root**. If the zip has exactly one `.html` file, it is used as `index.html`. |
| `slug` | no | Signed-in only. See below. Omit it. |

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

## Custom URLs (usually skip)

Signed-in users may send `slug` (pattern `^[a-z][a-z0-9-]{1,31}$`) to publish at `/d/<slug>/` as well as `/d/<id>/`. Guests sending `slug` get `401`.

Agents should **not** try to sign in, mint Magic Auth codes, or set slugs unless the user already has a session and explicitly wants a custom name.

Reserved slugs: `api`, `d`, `upload`, `sign-in`, `decks`, `pricing`, `assets`, `www`.

## What not to do

- Do not call WorkOS, `/api/auth/*`, `/api/decks`, or `/api/me` to publish a guest deck.
- Do not assume a JSON upload API, S3 URLs, or API keys.
- Do not tell the user they must create an account to get a link.
- Do not put secrets in the HTML you upload; decks are public.
