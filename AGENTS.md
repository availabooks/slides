# Slides for agents

**Canonical package lives in the Availabooks app**, not this nested repo:

- Live skill: https://app.availabooks.com/slides/skills/slides/SKILL.md
- Live CLI: https://app.availabooks.com/slides/skills/slides/slides.mjs
- Skill zip: https://app.availabooks.com/slides/skills/slides.zip
- In-app source: `../app/slides/` (`skills/`, `runtime/`, `llms.txt`)
- Worker routes: `../app/src/slides/`
- Discovery: https://app.availabooks.com/slides/llms.txt

This directory is a **legacy standalone host**. Do not sync skill copies here — edit `app/slides/` only.

Publishing requires an Availabooks account. Default login opens the browser — do **not** require `--email`.

```
curl -fsSL -o slides.mjs https://app.availabooks.com/slides/skills/slides/slides.mjs
node slides.mjs login
# finish sign-in in the browser, then:
node slides.mjs upload deck.html --slug my-talk
```

Pass `--host` / `SLIDES_HOST` for local or staging. The printed share URL is on that same host.

Do not call WorkOS from an agent. Only Availabooks host APIs (`app.availabooks.com` or the `--host` the user gave).
