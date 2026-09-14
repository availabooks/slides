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
          <li>Signed-in users get a library and can unpublish</li>
        </ul>
      </div>
      <div className="card">
        <h2 className="h2">For AI agents</h2>
        <p className="muted">
          Publish a deck with one POST. No account or API key.{' '}
          <a href="/skills/slides/SKILL.md">Load the skill</a>
          {' \u00b7 '}
          <a href="/llms.txt">llms.txt</a>
        </p>
        <pre className="agent-snippet">
          <code>
            {`curl -sS -X POST https://slides.availabooks.com/api/upload \\
  -F mode=paste \\
  -F html=@deck.html`}
          </code>
        </pre>
      </div>
    </section>
  );
}
