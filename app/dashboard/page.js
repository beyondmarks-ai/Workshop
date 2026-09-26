"use client";

import { useEffect, useState } from "react";
import GravityStarsBackground from "../components/gravity-stars-background";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState({ apiKeyPrefix: null, apiKey: "" });
  const [keyVisible, setKeyVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [endpointCategory, setEndpointCategory] = useState("generative");

  useEffect(() => {
    const refreshUser = () => fetch("/api/auth")
      .then(async (response) => {
        if (!response.ok) {
          window.location.href = "/";
          return;
        }
        setUser((await response.json()).user);
      })
      .catch(() => { window.location.href = "/"; })
      .finally(() => setLoading(false));
    refreshUser();
    const interval = window.setInterval(refreshUser, 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/access").then((response) => response.ok && response.json()).then((data) => {
      if (data) setAccess((current) => ({ ...current, ...data }));
    }).catch(() => {});
  }, [user]);

  async function generateApiKey() {
    const response = await fetch("/api/access", { method: "POST" });
    if (!response.ok) return null;
    const data = await response.json();
    setAccess((current) => ({ ...current, ...data }));
    return data.apiKey;
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  async function copyApiKey() {
    const key = access.apiKey || await generateApiKey();
    if (!key) return;
    await copyText(key);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  async function copyServiceEndpoint(path) {
    await copyText(`${window.location.origin}${path}`);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  async function toggleApiKeyVisibility() {
    if (!access.apiKey && !await generateApiKey()) return;
    setKeyVisible((visible) => !visible);
  }

  if (loading || !user) return <main className="dashboard-shell" aria-busy="true" />;

  const endpointItems = (access.endpoints || []).filter((endpoint) => endpoint.category === endpointCategory);

  return (
    <main className="dashboard-shell" aria-label="Beyond Marks AI Academy dashboard">
      <GravityStarsBackground starsCount={Math.max(0, Number(user.credits ?? 100))} className="dashboard-stars" />
      <div className="dashboard-student-welcome">
        <p><span>Welcome,</span><strong>{user.name}</strong></p>
        <small className="dashboard-api-label">API KEY</small>
        <div className="dashboard-api-key">
          <div className="dashboard-api-key-value">
            <code>{keyVisible && access.apiKey ? access.apiKey : access.apiKeyPrefix ? `${access.apiKeyPrefix}********` : "Creating key..."}</code>
          </div>
          <button type="button" onClick={toggleApiKeyVisibility} aria-label={keyVisible ? "Hide API key" : "Show API key"} title={keyVisible ? "Hide API key" : "Show API key"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          </button>
          <button type="button" onClick={copyApiKey} aria-label="Copy API key" title="Copy API key">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
          </button>
          {copyStatus && <small>{copyStatus}</small>}
        </div>
      </div>
      <section className="pricing-card-wrap" aria-label="Pro plan">
        <article className="pricing-card">
          <div className="pricing-card-glow" aria-hidden="true" />
          <header className="pricing-card-header">
            <div className="pricing-card-title-row"><h2>API Endpoints</h2><span className="pricing-card-badge">{endpointItems.length} available</span></div>
          </header>
          <div className="endpoint-category-toggle" role="tablist" aria-label="Model endpoint type">
            {[['generative', 'Generative'], ['image', 'Image models'], ['video', 'Video models'], ['other', 'Other']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={endpointCategory === id} className={endpointCategory === id ? "active" : ""} onClick={() => setEndpointCategory(id)}>{label}</button>)}
          </div>
          <div className="pricing-card-content">
            {endpointItems.length ? endpointItems.map((endpoint) => <div className="pricing-endpoint" key={endpoint.id}><div><strong>{endpoint.name}</strong><code>{endpoint.path}</code></div><button type="button" onClick={() => copyServiceEndpoint(endpoint.path)}>Copy endpoint</button></div>) : <p className="pricing-empty">{endpointCategory === "generative" ? "Loading endpoints..." : endpointCategory === "other" ? "Other endpoints are not configured yet." : `${endpointCategory === "image" ? "Image" : "Video"} model endpoints are not configured yet.`}</p>}
          </div>
          {copyStatus && <small className="pricing-copy-status" role="status">{copyStatus}</small>}
        </article>
      </section>
      <div className="dashboard-credits" aria-label={`${user.credits ?? 100} credits`}>
        <small>CREDITS</small>
        <strong>{user.credits ?? 100}</strong>
      </div>
    </main>
  );
}
