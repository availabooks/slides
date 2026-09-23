import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="home">
      <section className="home-hero" aria-label="Slides">
        <div className="home-hero-grid" aria-hidden="true" />

        <div className="home-hero-copy">
          <p className="home-kicker">Slides</p>
          <p className="home-headline">
            Web presentations that
            <span className="home-headline-accent"> actually work.</span>
          </p>
          <p className="home-sub">
            Share a link instead of a file. Decks feel great on a phone, adapt
            their layout to the screen, and are built for AI from the start —
            HTML you can host in one step.
          </p>
          <div className="row gap-m home-hero-actions">
            <Link to="/upload" className="btn">
              Upload a deck
            </Link>
            <Link to="/pricing" className="btn btn-secondary">
              Guest vs account
            </Link>
          </div>
        </div>

        <div className="home-stage" aria-hidden="true">
          <div className="home-stage-frame">
            <div className="home-slide home-slide-back">
              <span className="home-slide-label">03</span>
              <div className="home-slide-bars">
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="home-slide home-slide-mid">
              <span className="home-slide-label">02</span>
              <div className="home-slide-chart">
                <b />
                <b />
                <b />
                <b />
              </div>
            </div>
            <div className="home-slide home-slide-front">
              <span className="home-slide-label">01</span>
              <strong className="home-slide-title">Your talk.</strong>
              <span className="home-slide-url">slides.availabooks.com/d/…</span>
              <div className="home-slide-dots">
                <i className="is-on" />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className="home-url-chip">
            <span className="home-url-chip-dot" />
            live · /d/my-talk/
          </div>
        </div>
      </section>

      <section className="home-section">
        <h2 className="h2 home-section-title">Why host on the web</h2>
        <p className="muted lead lead-center home-section-lead">
          A link beats an attachment. Viewers get a live deck that fits their
          device — not a static download that fights the screen.
        </p>
        <div className="home-features">
          <article className="home-feature">
            <h3 className="home-feature-title">Made for phones</h3>
            <p className="muted">
              Swipe between slides, tap large controls, and open deep links to a
              specific slide — no pinch-zooming a desktop layout.
            </p>
          </article>
          <article className="home-feature">
            <h3 className="home-feature-title">Layouts that adapt</h3>
            <p className="muted">
              HTML and CSS reshape for the viewport. Your deck can reflow,
              stack, and stay readable instead of locking to a fixed slide size.
            </p>
          </article>
          <article className="home-feature">
            <h3 className="home-feature-title">Share with a link</h3>
            <p className="muted">
              Upload once, send <code>/d/…</code>. Guests get a random URL;
              accounts can pick a name. No inbox-clogging files.
            </p>
          </article>
          <article className="home-feature">
            <h3 className="home-feature-title">AI-native</h3>
            <p className="muted">
              Agents write HTML decks; you (or they) publish with the skill and
              CLI. Paste, files, or a zip — permanent public hosting in one step.
            </p>
          </article>
        </div>
      </section>

      <section className="home-section">
        <h2 className="h2 home-section-title">Example decks</h2>
        <p className="muted lead lead-center home-section-lead">
          Real presentations hosted here — open any link on your phone or
          desktop.
        </p>
        <div className="home-examples">
          <a
            className="home-example"
            href="https://slides.availabooks.com/d/aicues/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="home-example-slug">/d/aicues/</span>
            <strong className="home-example-title">AI Cues — a brown-bag tour</strong>
            <span className="muted home-example-blurb">
              A lunch-hour product talk: prompts as a wallet, shareable links,
              and launching ChatGPT or Claude in one tap.
            </span>
          </a>
          <a
            className="home-example"
            href="https://slides.availabooks.com/d/wkWpGpluJNl8/"
            target="_blank"
            rel="noreferrer"
          >
            <span className="home-example-slug">/d/wkWpGpluJNl8/</span>
            <strong className="home-example-title">
              agent-eval · Scoring Alex in ee-atlas
            </strong>
            <span className="muted home-example-blurb">
              An engineering deep-dive with mobile swipe, hash deep links, and a
              thumbnail jumper built into the host.
            </span>
          </a>
        </div>
      </section>

      <section className="home-section home-section-tight">
        <div className="card home-agent-card">
          <h2 className="h2">For AI agents</h2>
          <p className="muted">
            The skill is a single package: docs plus a Node CLI. Download the
            folder and drop it into Cursor (or any agent) as <code>slides/</code>
            . Guest publish needs no account.{' '}
            <a href="/skills/slides/SKILL.md">Load the skill</a>
            {' · '}
            <a href="/skills/slides/slides.mjs">slides.mjs</a>
            {' · '}
            <a href="/llms.txt">llms.txt</a>
          </p>
          <div className="row gap-m">
            <a className="btn" href="/skills/slides.zip" download="slides.zip">
              Download skill
            </a>
          </div>
          <pre className="agent-snippet">
            <code>
              {`curl -fsSL -o slides.mjs https://slides.availabooks.com/skills/slides/slides.mjs
node slides.mjs login
node slides.mjs upload deck.html --slug my-talk`}
            </code>
          </pre>
        </div>
      </section>
    </div>
  );
}
