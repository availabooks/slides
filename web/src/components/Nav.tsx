import React, { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MeContext } from '../App';

export default function Nav() {
  const { me, refresh } = useContext(MeContext);
  const loc = useLocation();
  const navigate = useNavigate();

  const onLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    await refresh();
    if (loc.pathname.startsWith('/decks')) {
      navigate('/');
    }
  };

  return (
    <header className="entry-header">
      <h1 className="post-title entry-title">
        <Link to="/">Slides</Link>
      </h1>
      <nav className="header-actions">
        <Link to="/upload" className="header-text-link">
          Upload
        </Link>
        <Link to="/pricing" className="header-text-link">
          Pricing
        </Link>
        {me?.authenticated ? (
          <>
            <Link to="/decks" className="header-text-link">
              My decks
            </Link>
            <button
              className="material-symbols-outlined menu-button login-button logged-in"
              onClick={onLogout}
              type="button"
              title="Sign out"
            >
              logout
            </button>
          </>
        ) : (
          <Link
            to="/sign-in"
            className="material-symbols-outlined menu-button login-button"
            title="Sign in"
          >
            person
          </Link>
        )}
      </nav>
    </header>
  );
}
