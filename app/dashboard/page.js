"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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

  if (loading || !user) return <main className="dashboard-shell"><div className="dashboard-loading">Loading your workspace…</div></main>;

  return (
    <main className="dashboard-shell">
      <div className="dashboard-orbit dashboard-orbit-one" aria-hidden="true" />
      <div className="dashboard-orbit dashboard-orbit-two" aria-hidden="true" />
      <header className="dashboard-header">
        <div className="dashboard-mark"><span>BM</span><strong>Beyond Marks</strong></div>
        <button className="dashboard-signout" type="button" onClick={signOut}>Sign Out</button>
      </header>
      <section className="dashboard-main">
        <p className="dashboard-kicker">STUDENT WORKSPACE</p>
        <h1>Good to see you, <span>{user.name}</span>.</h1>
        <p className="dashboard-subtitle">Your AI Academy Workshop space is ready.</p>
        <div className="dashboard-cards">
          <article className="dashboard-card dashboard-card-primary">
            <span className="card-label">YOUR PROFILE</span>
            <strong>{user.name}</strong>
            <small>{user.email || user.contact}</small>
            <div className="profile-facts"><span><b>Branch</b>{user.branch}</span><span><b>Semester</b>{user.semester}</span><span><b>USN</b>{user.usn}</span></div>
          </article>
          <article className="dashboard-card dashboard-card-action"><span className="card-icon">✦</span><span className="card-label">LEARNING HUB</span><strong>Start your next workshop</strong><p>Explore your learning journey and build something meaningful.</p><button type="button">Get Started <span>→</span></button></article>
        </div>
      </section>
    </main>
  );
}
