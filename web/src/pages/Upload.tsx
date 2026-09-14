import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { MeContext } from '../App';

type Mode = 'paste' | 'files' | 'zip';

export default function Upload() {
  const { me } = useContext(MeContext);
  const [mode, setMode] = useState<Mode>('paste');
  const [pasteHtml, setPasteHtml] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [zip, setZip] = useState<File | null>(null);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; slug: string | null; url: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set('mode', mode);
      if (mode === 'paste') {
        fd.set('html', pasteHtml);
      } else if (mode === 'files') {
        if (files) {
          Array.from(files).forEach((f) => fd.append('files', f));
        }
      } else if (mode === 'zip') {
        if (zip) fd.set('zip', zip);
      }
      if (me?.authenticated && slug.trim()) {
        fd.set('slug', slug.trim().toLowerCase());
      }
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: fd,
        credentials: 'include'
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(parseError(text) || `Upload failed (${res.status})`);
      }
      const data = (await res.json()) as { id: string; slug: string | null; url: string };
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack gap-l">
      <h1 className="h1">Upload</h1>
      <p className="muted lead">
        Paste a full HTML deck, pick files that include index.html, or upload a
        zip.
      </p>
      <div className="tabs">
        <button
          className={`tab ${mode === 'paste' ? 'active' : ''}`}
          type="button"
          onClick={() => setMode('paste')}
        >
          Paste
        </button>
        <button
          className={`tab ${mode === 'files' ? 'active' : ''}`}
          type="button"
          onClick={() => setMode('files')}
        >
          Files
        </button>
        <button
          className={`tab ${mode === 'zip' ? 'active' : ''}`}
          type="button"
          onClick={() => setMode('zip')}
        >
          Zip
        </button>
      </div>

      <form onSubmit={onSubmit} className="stack gap-m">
        {mode === 'paste' && (
          <textarea
            className="input"
            rows={14}
            placeholder="Paste full HTML here..."
            value={pasteHtml}
            onChange={(e) => setPasteHtml(e.target.value)}
          />
        )}
        {mode === 'files' && (
          <input
            className="input"
            type="file"
            multiple
            onChange={(e) => setFiles(e.target.files)}
          />
        )}
        {mode === 'zip' && (
          <input
            className="input"
            type="file"
            accept=".zip"
            onChange={(e) => setZip(e.target.files?.[0] || null)}
          />
        )}
        {me?.authenticated ? (
          <div className="stack gap-xs">
            <label className="field-label" htmlFor="deck-slug">
              Custom URL (optional)
            </label>
            <div className="slug-field">
              <span className="slug-prefix">/d/</span>
              <input
                id="deck-slug"
                className="input"
                type="text"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="welcome"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
              />
            </div>
            <div className="muted small">
              Letters, numbers, and hyphens. Must start with a letter. Leave
              blank for a random link.
            </div>
          </div>
        ) : (
          <p className="muted small">
            Guests get a random link.{' '}
            <Link to="/sign-in">Sign in</Link> to choose a name like{' '}
            <code>/d/welcome/</code>. See <Link to="/pricing">pricing</Link>.
          </p>
        )}
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </form>
      {result && (
        <div className="card">
          <div className="row gap-s">
            <div>Deck uploaded:</div>
            <a href={result.url} target="_blank" rel="noreferrer">
              {result.url}
            </a>
          </div>
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </section>
  );
}

function parseError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string };
    return parsed.error || text;
  } catch {
    return text;
  }
}
