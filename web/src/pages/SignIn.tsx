import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MeContext } from '../App';

async function apiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
}

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<'start' | 'verify'>('start');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { refresh } = useContext(MeContext);

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/magic/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (!res.ok) throw new Error(await apiError(res));
      setPhase('verify');
    } catch (err: any) {
      setError(err.message || 'Failed to start');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/magic/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code })
      });
      if (!res.ok) throw new Error(await apiError(res));
      await refresh();
      navigate('/decks');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="login stack gap-l">
      <h1 className="h1">Sign in</h1>
      {phase === 'start' ? (
        <form onSubmit={start} className="stack gap-m">
          <p className="muted lead">We’ll email you a 6-digit sign-in code.</p>
          <label className="field-label" htmlFor="sign-in-email">
            Email
          </label>
          <input
            id="sign-in-email"
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      ) : (
        <form onSubmit={verify} className="stack gap-m">
          <p className="muted lead">Enter the 6-digit code we sent to {email}.</p>
          <label className="field-label" htmlFor="sign-in-code">
            Verification code
          </label>
          <input
            id="sign-in-code"
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Verifying…' : 'Verify and sign in'}
          </button>
          {error && <div className="error">{error}</div>}
        </form>
      )}
    </section>
  );
}
