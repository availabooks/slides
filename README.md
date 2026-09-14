Slides — Cloudflare Workers app
===============================

Free host for AI-made HTML/CSS/JS presentation decks.

- Guests and signed-in users can paste HTML, upload multiple files, or upload a zip to get a permanent public URL `/d/<id>/`
- Signed-in users can also pick a custom slug like `/d/welcome/`
- Links never expire; owners can unpublish
- Guests: upload → link, no library
- Signed-in: passwordless email via WorkOS Magic Auth (custom UI), "My decks" list, unpublish

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
