import React, { useContext, useEffect, useState } from 'react';
import { MeContext } from '../App';

type Deck = {
  id: string;
  slug: string | null;
  url: string;
  title: string | null;
  createdAt: string;
};

export default function Decks() {
  const { me } = useContext(MeContext);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch('/api/decks', { credentials: 'include' });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Deck[];
      setDecks(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load');
    }
  };

  useEffect(() => {
    if (me?.authenticated) void load();
  }, [me?.authenticated]);

  const unpublish = async (id: string) => {
    if (!confirm('Unpublish this deck? This deletes the files.')) return;
    const res = await fetch(`/api/decks/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await load();
  };

  if (!me?.authenticated) {
    return (
      <section className="stack gap-l">
        <h1 className="h1">My decks</h1>
        <div className="muted">Sign in to see your deck library.</div>
      </section>
    );
  }

  return (
    <section className="stack gap-l">
      <h1 className="h1">My decks</h1>
      {error && <div className="error">{error}</div>}
      {decks === null ? (
        <div className="muted">Loading…</div>
      ) : decks.length === 0 ? (
        <div className="muted">No decks yet.</div>
      ) : (
        <ul className="deck-list">
          {decks.map((d) => (
            <li key={d.id} className="deck-item">
              <DeckRow deck={d} onSaved={load} onUnpublish={unpublish} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeckRow({
  deck,
  onSaved,
  onUnpublish
}: {
  deck: Deck;
  onSaved: () => Promise<void>;
  onUnpublish: (id: string) => Promise<void>;
}) {
  const [slug, setSlug] = useState(deck.slug ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSlug(deck.slug ?? '');
  }, [deck.slug]);

  const saveSlug = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug: slug.trim() || null })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(parseError(text));
      }
      await onSaved();
    } catch (err: any) {
      setError(err.message || 'Could not save URL');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="stack gap-xs deck-item-main">
        <a href={deck.url} target="_blank" rel="noreferrer">
          {deck.title || deck.slug || deck.id}
        </a>
        <div className="muted small">{deck.url}</div>
        <div className="muted small">{new Date(deck.createdAt).toLocaleString()}</div>
        <form className="slug-edit" onSubmit={saveSlug}>
          <label className="field-label" htmlFor={`slug-${deck.id}`}>
            Custom URL
          </label>
          <div className="slug-field">
            <span className="slug-prefix">/d/</span>
            <input
              id={`slug-${deck.id}`}
              className="input"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="welcome"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn btn-secondary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
          {error && <div className="error">{error}</div>}
        </form>
      </div>
      <button
        className="btn btn-ghost"
        onClick={() => onUnpublish(deck.id)}
        type="button"
      >
        Unpublish
      </button>
    </>
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
