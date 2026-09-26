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

  useEffect(() => {
    fetch("/api/admin").then(async (response) => {
      if (!response.ok) { if (response.status === 401) setGate(true); throw new Error((await response.json()).error || "Admin access required."); }
      setData(await response.json());
    }).catch((reason) => setError(reason.message));
  }, []);

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
    if (response.ok) window.location.reload();
  }

  const students = useMemo(() => (data?.users || []).filter((user) => JSON.stringify(user).toLowerCase().includes(query.toLowerCase())), [data, query]);
  if (gate) return <main className="admin-shell"><section className="admin-gate"><small>BEYOND MARKS AI ACADEMY</small><h1>Admin verification</h1><p>Enter the admin email and six-digit PIN to review student access.</p><form onSubmit={verifyAdmin}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Admin email" required /><input type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="6-digit PIN" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />{error && <p className="admin-error">{error}</p>}<button type="submit" disabled={busy}>{busy ? "Verifying..." : "Open admin dashboard"}</button></form><a href="/">Back to sign in</a></section></main>;
  if (!data) return <main className="admin-shell" aria-busy="true" />;

  return <main className="admin-shell">
    <header className="admin-header"><div><small>BEYOND MARKS AI ACADEMY</small><h1>Admin Control Center</h1></div><a href="/dashboard">Dashboard</a></header>
    <section className="admin-summary">{[["Students", data.summary.students], ["Resources", data.summary.resources], ["Credits remaining", data.summary.credits]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>LIVE AZURE DATA</small><h2>Student accounts</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" /></div><div className="admin-table">{students.map((student) => <article key={student.id}><div><strong>{student.name}</strong><span>{student.email}</span></div><span>{student.branch || "â€”"} Â· {student.semester || "â€”"}</span>{student.role === "student" && student.verified !== true ? <button className="admin-verify-button" type="button" onClick={() => verifyStudent(student.id)}>Verify</button> : <b>{student.credits ?? 100} credits</b>}</article>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>AZURE BLOB STORAGE</small><h2>Stored resources</h2></div></div><div className="admin-table">{data.materials.map((material) => <article key={material.id}><div><strong>{material.name}</strong><span>{material.id}</span></div><span>{Math.round((material.size || 0) / 1024)} KB</span><b>{material.translations.length + material.audioLessons.length} generated</b></article>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>STUDENT BLOB STORAGE</small><h2>Student uploads</h2></div></div><div className="admin-table">{data.studentResources.map((resource) => <article key={`${resource.ownerId}-${resource.id}`}><div><strong>{resource.name}</strong><span>{resource.ownerId}</span></div><span>{Math.round((resource.size || 0) / 1024)} KB</span><b>{resource.contentType}</b></article>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>COSMOS DB ACTIVITY</small><h2>API and chat activity</h2></div></div><div className="admin-table">{data.activities.map((activity) => <article key={activity.id}><div><strong>{activity.service}</strong><span>{activity.studentId}</span></div><span>{new Date(activity.createdAt).toLocaleString()}</span><b>{activity.status} Â· -{activity.creditsUsed}</b></article>)}</div></section>
  </main>;
}

