"use client";

import { useEffect, useMemo, useState } from "react";
import GravityStarsBackground from "../components/gravity-stars-background";

export default function AdminPage() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [gate, setGate] = useState(false);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [expandedStudent, setExpandedStudent] = useState("");
  const [note, setNote] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState("add");

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
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "verify-admin", email, pin, code }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error || "Admin verification failed."); setBusy(false); return; }
    window.location.reload();
  }

  async function verifyStudent(studentId) {
    await runAction(studentId, "verify-student");
  }

  async function logoutAdmin() {
    await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout-admin" }) });
    window.location.reload();
  }

  async function polishComment() {
    setPolishing(true);
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "polish-comment", comment: note }) });
    const result = await response.json();
    if (response.ok) setNote(result.comment);
    else setError(result.error || "Could not polish comment.");
    setPolishing(false);
  }

  async function applyCreditAdjustment() {
    if (!selectedStudentIds.length || !adjustmentAmount) return;
    setActionBusy("bulk");
    setError("");
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "adjust-credits-bulk", studentIds: selectedStudentIds, delta: (adjustmentDirection === "add" ? 1 : -1) * Number(adjustmentAmount), note }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Credit adjustment failed.");
    else { await load(); setSelectedStudentIds([]); setAdjustmentAmount(""); }
    setActionBusy("");
  }

  async function runAction(studentId, action, delta) {
    if ((action === "revoke-student" || action === "delete-student") && !window.confirm(action === "delete-student" ? "Delete this student account permanently?" : "Revoke this student’s access?") ) return;
    setActionBusy(`${action}:${studentId}`);
    setError("");
    const response = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, studentId, delta, note }) });
    const result = await response.json();
    if (!response.ok) setError(result.error || "Admin action failed.");
    if (response.ok) await load();
    setActionBusy("");
  }

  const students = useMemo(() => (data?.users || []).filter((user) => user.role === "student" && JSON.stringify(user).toLowerCase().includes(query.toLowerCase())), [data, query]);

  if (gate) return <main className="admin-shell"><section className="admin-gate"><small>BEYOND MARKS AI ACADEMY</small><h1>Admin verification</h1><p>Enter your admin email, PIN, and six-digit Google Authenticator code.</p><form onSubmit={verifyAdmin}><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Admin email" required /><input type="password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder="6-digit PIN" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required /><input type="text" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Authenticator code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />{error && <p className="admin-error">{error}</p>}<button type="submit" disabled={busy}>{busy ? "Verifying..." : "Open student access"}</button></form><a href="/">Back to sign in</a></section></main>;
  if (!data) return <main className="admin-shell" aria-busy="true" />;

  return <main className="admin-shell"><GravityStarsBackground starsCount={75} className="dashboard-stars" />
    <section className="admin-card admin-students-card"><div className="admin-card-heading"><div><small>ACCESS CONTROL</small><h2>Student accounts</h2></div><div className="admin-card-tools"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students" /><button className="admin-logout-button" type="button" onClick={logoutAdmin}>Sign out</button></div></div><div className="admin-note-tools"><strong>{selectedStudentIds.length ? `${selectedStudentIds.length} student${selectedStudentIds.length > 1 ? "s" : ""} selected` : "Select students below"}</strong>{selectedStudentIds.length ? <><input value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} type="number" min="0.01" step="0.1" placeholder="Amount" /><select value={adjustmentDirection} onChange={(event) => setAdjustmentDirection(event.target.value)}><option value="add">Add credits</option><option value="remove">Remove credits</option></select><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason for credit change" maxLength={500} /><button type="button" onClick={polishComment} disabled={polishing || !note.trim()}>{polishing ? "Polishing..." : "Polish with GPT-4.1"}</button><button type="button" onClick={applyCreditAdjustment} disabled={!!actionBusy || !adjustmentAmount || !note.trim()}>Save adjustment</button><button type="button" className="admin-cancel-button" onClick={() => setSelectedStudentIds([])}>Clear</button></> : <span>Use the checkboxes to select one or more students.</span>}</div>{error && <p className="admin-error">{error}</p>}<div className="admin-table">{students.length ? students.map((student) => { const verified = student.verified === true; return <article key={student.id}><input className="admin-student-checkbox" type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={(event) => setSelectedStudentIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} aria-label={`Select ${student.name}`} /><button className="admin-student-identity" type="button" onClick={() => setExpandedStudent((current) => current === student.id ? "" : student.id)}><strong>{student.name}</strong><span>{student.email}</span><i>{expandedStudent === student.id ? "−" : "+"}</i></button><span>{student.branch || "Unknown branch"} / {student.semester || "Unknown semester"}</span><span className={`admin-status ${verified ? "verified" : "pending"}`}>{verified ? "Verified" : "Locked"}</span><b>{verified ? `${student.credits ?? 0} credits` : "Credits locked"}</b><div className="admin-actions">{verified ? <><button type="button" onClick={() => runAction(student.id, "revoke-student")} disabled={!!actionBusy}>Revoke</button></> : <button className="admin-verify-button" type="button" onClick={() => verifyStudent(student.id)} disabled={!!actionBusy}>Verify access</button>}<button className="admin-delete-button" type="button" onClick={() => runAction(student.id, "delete-student")} disabled={!!actionBusy}>Delete</button></div>{expandedStudent === student.id && <div className="admin-student-details"><span><small>Email</small><b>{student.email}</b></span><span><small>Contact</small><b>{student.contactNumber || student.contact || "Not provided"}</b></span><span><small>Branch</small><b>{student.branch || "Not provided"}</b></span><span><small>Semester</small><b>{student.semester || "Not provided"}</b></span><span><small>USN</small><b>{student.usn || "Not provided"}</b></span><span><small>Joined</small><b>{student.createdAt ? new Date(student.createdAt).toLocaleDateString() : "Not available"}</b></span></div>}</article>; }) : <p className="admin-empty">No student accounts found.</p>}</div></section>
  </main>;
}
