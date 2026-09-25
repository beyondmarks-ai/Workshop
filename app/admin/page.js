"use client";

import { useEffect, useMemo, useState } from "react";

export default function AdminPage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin").then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error || "Admin access required.");
      setData(await response.json());
    }).catch((reason) => setError(reason.message));
  }, []);

  const students = useMemo(() => (data?.users || []).filter((user) => JSON.stringify(user).toLowerCase().includes(query.toLowerCase())), [data, query]);
  if (error) return <main className="admin-shell"><p className="admin-error">{error}</p><a href="/dashboard">Return to dashboard</a></main>;
  if (!data) return <main className="admin-shell" aria-busy="true" />;

  return <main className="admin-shell">
    <header className="admin-header"><div><small>BEYOND MARKS AI ACADEMY</small><h1>Admin Control Center</h1></div><a href="/dashboard">Dashboard</a></header>
    <section className="admin-summary">{[["Students", data.summary.students], ["Resources", data.summary.resources], ["Credits remaining", data.summary.credits]].map(([label, value]) => <article key={label}><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>LIVE AZURE DATA</small><h2>Student accounts</h2></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" /></div><div className="admin-table">{students.map((student) => <article key={student.id}><div><strong>{student.name}</strong><span>{student.email}</span></div><span>{student.branch || "—"} · {student.semester || "—"}</span><b>{student.credits ?? 100} credits</b></article>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>AZURE BLOB STORAGE</small><h2>Stored resources</h2></div></div><div className="admin-table">{data.materials.map((material) => <article key={material.id}><div><strong>{material.name}</strong><span>{material.id}</span></div><span>{Math.round((material.size || 0) / 1024)} KB</span><b>{material.translations.length + material.audioLessons.length} generated</b></article>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>STUDENT BLOB STORAGE</small><h2>Student uploads</h2></div></div><div className="admin-table">{data.studentResources.map((resource) => <article key={`${resource.ownerId}-${resource.id}`}><div><strong>{resource.name}</strong><span>{resource.ownerId}</span></div><span>{Math.round((resource.size || 0) / 1024)} KB</span><b>{resource.contentType}</b></article>)}</div></section>
    <section className="admin-card"><div className="admin-card-heading"><div><small>COSMOS DB ACTIVITY</small><h2>API and chat activity</h2></div></div><div className="admin-table">{data.activities.map((activity) => <article key={activity.id}><div><strong>{activity.service}</strong><span>{activity.studentId}</span></div><span>{new Date(activity.createdAt).toLocaleString()}</span><b>{activity.status} · -{activity.creditsUsed}</b></article>)}</div></section>
  </main>;
}
