"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth")
      .then(async (response) => {
        if (!response.ok) {
          window.location.href = "/";
          return;
        }
        setUser((await response.json()).user);
      })
      .catch(() => { window.location.href = "/"; })
      .finally(() => setLoading(false));
  }, []);

  const signOut = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/";
  };

  if (loading || !user) return <main className="dashboard-shell" aria-busy="true" />;

  return (
    <main className="dashboard-shell" aria-label="Beyond Marks AI Academy dashboard">
      <button
        className={`menu-toggle dashboard-menu-toggle${menuOpen ? " open" : ""}`}
        type="button"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span />
        <span />
        <span />
      </button>
      <button
        className={`drawer-backdrop${menuOpen ? " visible" : ""}`}
        type="button"
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />
      <aside className={`side-drawer dashboard-drawer${menuOpen ? " open" : ""}`} aria-hidden={!menuOpen} />
    </main>
  );
}
