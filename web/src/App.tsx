import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Nav from './components/Nav';

export type Me = {
  authenticated: boolean;
  user: { id: string; email: string } | null;
};

export const MeContext = React.createContext<{
  me: Me | null;
  refresh: () => Promise<void>;
}>({
  me: null,
  refresh: async () => {}
});

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const data = (await res.json()) as Me;
      setMe(data);
    } catch {
      setMe({ authenticated: false, user: null });
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <MeContext.Provider value={{ me, refresh }}>
      <div className="index-boxnbt">
        <Nav />
        <main className="post-body">
          <Outlet />
        </main>
      </div>
    </MeContext.Provider>
  );
}
