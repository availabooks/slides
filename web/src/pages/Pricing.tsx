import React from 'react';
import { Link } from 'react-router-dom';

const rows: Array<{ feature: string; guest: string; account: string }> = [
  {
    feature: 'Paste HTML, upload files, or a zip',
    guest: 'Yes',
    account: 'Yes'
  },
  {
    feature: 'Permanent public link',
    guest: '/d/YhtLgrE4gitf/',
    account: '/d/YhtLgrE4gitf/ or /d/welcome/'
  },
  {
    feature: 'Custom URL name',
    guest: 'No',
    account: 'Yes — choose a name like welcome'
  },
  {
    feature: 'Your decks list',
    guest: 'No',
    account: 'Yes'
  },
  {
    feature: 'Unpublish a deck',
    guest: 'No',
    account: 'Yes, owner only'
  },
  {
    feature: 'Links expire',
    guest: 'Never',
    account: 'Never'
  },
  {
    feature: 'Price',
    guest: 'Free',
    account: 'Free'
  }
];

export default function Pricing() {
  return (
    <section className="stack gap-l">
      <h1 className="h1">Pricing</h1>
      <p className="muted lead">
        Hosting is free either way. An account is optional — it unlocks a library,
        unpublish, and custom URLs.
      </p>
      <div className="pricing-grid">
        <article className="card pricing-card">
          <h2 className="h2">Guest</h2>
          <p className="muted">No sign-in. Upload and share.</p>
          <ul className="list">
            <li>Paste, files, or zip</li>
            <li>Random permanent URL</li>
            <li>No library or unpublish</li>
          </ul>
          <Link to="/upload" className="btn btn-secondary">
            Upload as guest
          </Link>
        </article>
        <article className="card pricing-card pricing-card-featured">
          <h2 className="h2">Account</h2>
          <p className="muted">Same host, with control over your decks.</p>
          <ul className="list">
            <li>Everything guests get</li>
            <li>Custom names like /d/welcome/</li>
            <li>My decks list and unpublish</li>
          </ul>
          <Link to="/sign-in" className="btn">
            Create a free account
          </Link>
        </article>
      </div>
      <div className="card">
        <h2 className="h2">Compare</h2>
        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Guest</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature}>
                  <td>{row.feature}</td>
                  <td>{row.guest}</td>
                  <td>{row.account}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
