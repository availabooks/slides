# Slides for agents

This repo is the source for **Slides**, a free host for HTML/CSS/JS presentation decks.

If you need to **publish a deck**, do not guess APIs. Read and follow:

- Live: https://slides.availabooks.com/skills/slides/SKILL.md
- In-repo: [skills/slides/SKILL.md](skills/slides/SKILL.md)
- Discovery: https://slides.availabooks.com/llms.txt

Guest upload is `POST https://slides.availabooks.com/api/upload` as multipart form data (`mode=paste` + `html`). No API key. Return the `url` from the `201` JSON to the user.
