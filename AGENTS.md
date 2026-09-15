# Slides for agents

This repo is the source for **Slides**, a free host for HTML/CSS/JS presentation decks.

If you need to **publish a deck**, do not guess APIs. The skill folder is the whole package (docs + CLI):

- Live skill: https://slides.availabooks.com/skills/slides/SKILL.md
- Live CLI: https://slides.availabooks.com/skills/slides/slides.mjs
- Skill zip: https://slides.availabooks.com/skills/slides.zip (unpacks to `slides/` with everything)
- In-repo: [skills/slides/](skills/slides/)
- Discovery: https://slides.availabooks.com/llms.txt

Guest upload is `POST https://slides.availabooks.com/api/upload` as multipart form data (`mode=paste` + `html`). No API key. Return the `url` from the `201` JSON to the user.

If you generate the HTML, wrap each slide in `<section class="slide">` inside `#deck` so the host can add mobile swipe, `#n` deep links, and a thumbnail picker. Reveal.js already has `#/n` and overview — don’t also wrap it as `.slide`. Opt out with `<html data-slides-host="off">`. Details: the skill.

Custom `/d/<name>/` URLs need a signed-in session. Prefer the bundled CLI:

```
curl -fsSL -o slides.mjs https://slides.availabooks.com/skills/slides/slides.mjs
node slides.mjs login --email you@example.com
node slides.mjs upload deck.html --slug my-talk
```

Or curl Magic Auth yourself (never invent the 6-digit email code):

1. `POST /api/auth/magic/start` `{ email }`
2. `POST /api/auth/magic/verify` `{ email, code }` → `{ session, user }`
3. `POST /api/upload` with `Authorization: Bearer <session>` and form field `slug`

Do not call WorkOS from an agent. Only the Slides host APIs.
