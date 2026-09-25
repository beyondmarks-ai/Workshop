"use client";

import { useEffect, useState } from "react";

export default function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [message, setMessage] = useState("");
  const load = () => fetch("/api/resources").then((response) => response.ok ? response.json() : Promise.reject()).then((data) => setResources(data.resources)).catch(() => setMessage("Sign in to view your storage."));
  useEffect(() => { load(); }, []);
  async function upload(event) {
    const form = new FormData();
    form.append("file", event.target.files[0]);
    const response = await fetch("/api/resources", { method: "POST", body: form });
    setMessage(response.ok ? "Uploaded securely." : (await response.json()).error || "Upload failed.");
    event.target.value = "";
    if (response.ok) load();
  }
  return <main className="resources-shell"><header><div><small>PRIVATE AZURE BLOB STORAGE</small><h1>My Storage</h1><p>Only you can access these resources.</p></div><a href="/dashboard">Dashboard</a></header><label className="resource-upload">Upload resource<input type="file" onChange={upload} /></label>{message && <p className="resource-message">{message}</p>}<section className="resource-list">{resources.length ? resources.map((resource) => <article key={resource.id}><div><strong>{resource.name}</strong><span>{Math.round(resource.size / 1024)} KB · {resource.contentType}</span></div><a href={resource.url} target="_blank" rel="noreferrer">Open</a></article>) : <p>No resources stored yet.</p>}</section></main>;
}
