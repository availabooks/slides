import React from 'react';
import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="stack gap-l">
      <div className="book-title">Slides</div>
      <div className="book-author">Free host for AI-made HTML/CSS/JS decks</div>
      <p className="muted lead lead-center">
        Paste HTML, upload files, or a .zip — get a permanent link. Keep decks
        public forever or unpublish later if you sign in.
      </p>
      <div className="row gap-m center-actions">
        <Link to="/upload" className="btn">
          Upload a deck
        </Link>
        <Link to="/pricing" className="btn btn-secondary">
          Guest vs account
        </Link>
      </div>
      <div className="card">
        <h2 className="h2">How it works</h2>
        <ul className="list">
          <li>Upload supports paste, multiple files, or a .zip</li>
          <li>Guests get a random public URL like /d/abc123xyz/</li>
          <li>Signed-in users can also pick a name like /d/welcome/</li>
          <li>
            Decks with <code>.slide</code> sections get mobile swipe, #slide
            links, and a thumbnail jumper
          </li>
          <li>Signed-in users get a library and can unpublish</li>
        </ul>
      </div>
      <div className="card">
        <h2 className="h2">For AI agents</h2>
        <p className="muted">
          The skill is a single package: docs plus a Node CLI. Download the
          folder and drop it into Cursor (or any agent) as{' '}
          <code>slides/</code>. Guest publish needs no account.{' '}
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
node slides.mjs upload deck.html
node slides.mjs login --email you@example.com
node slides.mjs upload deck.html --slug my-talk`}
          </code>
        </pre>
      </div>
    </section>
  );
}
