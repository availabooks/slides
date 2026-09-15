# Slides for agents

This repo is the source for **Slides**, a free host for HTML/CSS/JS presentation decks.

If you need to **publish a deck**, do not guess APIs. Read and follow:

- Live: https://slides.availabooks.com/skills/slides/SKILL.md
- In-repo: [skills/slides/SKILL.md](skills/slides/SKILL.md)
- Discovery: https://slides.availabooks.com/llms.txt
- CLI: `node bin/slides.mjs` (`npx slides` after `npm install`)

Guest upload is `POST https://slides.availabooks.com/api/upload` as multipart form data (`mode=paste` + `html`). No API key. Return the `url` from the `201` JSON to the user.

Custom `/d/<name>/` URLs need a signed-in session. Ask the user for their email and the 6-digit Magic Auth code (never invent it), then:

1. `POST /api/auth/magic/start` `{ email }`
2. `POST /api/auth/magic/verify` `{ email, code }` → `{ session, user }`
3. `POST /api/upload` with `Authorization: Bearer <session>` and form field `slug`

Do not call WorkOS from an agent. Only the Slides host APIs.
