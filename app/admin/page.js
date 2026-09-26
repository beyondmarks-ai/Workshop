"use client";

import { useEffect, useMemo, useState } from "react";

export default function AdminPage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [gate, setGate] = useState(false);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin");
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) setGate(true);
      throw new Error(result.error || "Admin access required.");
    }
    setData(result);
  }

  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);

  async function verifyAdmin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify-admin", email, pin }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Admin verification failed."); setBusy(false); return; }
    window.location.reload();
  }

  async function verifyStudent(studentId) {
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify-student", studentId }) });
    if (response.ok) await load();
  }

  const students = useMemo(() => (data?.users || []).filter((user) => user.role === "student" && JSON.stringify(user).toLowerCase().includes(query.toLowerCase())), [data, query]);

  if (gate) return <main className="admin-shell"><section className="admin-gate"><small>BEYOND MARKS AI ACADEMY</small><h1>Admin verification</h1><p>Enter the admin email and six-digit PIN to manage student access.</p><form onSubmit={verifyAdmin}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Admin email" required /><input type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="6-digit PIN" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />{error && <p className="admin-error">{error}</p>}<button type="submit" disabled={busy}>{busy ? "Verifying..." : "Open student access"}</button></form><a href="/">Back to sign in</a></section></main>;
  if (!data) return <main className="admin-shell" aria-busy="true" />;

  return <main className="admin-shell">
    <header className="admin-header"><div><small>BEYOND MARKS AI ACADEMY</small><h1>Student access</h1><p>Review accounts and approve access to workshop services.</p></div><a href="/dashboard">Dashboard</a></header>
    <section className="admin-summary">{[["Student accounts", data.summary.students], ["Pending review", data.summary.pending], ["Credits allocated", data.summary.credits]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="admin-card admin-students-card"><div className="admin-card-heading"><div><small>ACCESS CONTROL</small><h2>Student accounts</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" /></div><div className="admin-table">{students.length ? students.map((student) => { const verified = student.verified === true; return <article key={student.id}><div><strong>{student.name}</strong><span>{student.email}</span></div><span>{student.branch || "Unknown branch"} / {student.semester || "Unknown semester"}</span><span className={`admin-status ${verified ? "verified" : "pending"}`}>{verified ? "Verified" : "Pending"}</span>{verified ? <b>{student.credits ?? 0} credits</b> : <button className="admin-verify-button" type="button" onClick={() => verifyStudent(student.id)}>Verify access</button>}</article>; }) : <p className="admin-empty">No student accounts found.</p>}</div></section>
  </main>;
}

