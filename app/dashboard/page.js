"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessOpen, setAccessOpen] = useState(false);
  const [access, setAccess] = useState({ services: [], apiKeyPrefix: null, apiKey: "", apiEndpoint: "" });
  const [keyVisible, setKeyVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [endpointStatus, setEndpointStatus] = useState("idle");

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

  useEffect(() => {
    if (!user) return;
    fetch("/api/access").then((response) => response.ok && response.json()).then((data) => {
      if (!data) return;
      setAccess((current) => ({ ...current, ...data }));
      setApiEndpoint(`${window.location.origin}${data.apiEndpoint || "/api/proxy/responses"}`);
    }).catch(() => {});
  }, [user]);

  async function generateApiKey() {
    const response = await fetch("/api/access", { method: "POST" });
    if (!response.ok) return null;
    const data = await response.json();
    setAccess((current) => ({ ...current, ...data }));
    return data.apiKey;
  }

  async function copyApiKey() {
    const key = access.apiKey || await generateApiKey();
    if (!key) return;
    await navigator.clipboard.writeText(key);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  async function copyEndpoint() {
    if (!apiEndpoint) return;
    await navigator.clipboard.writeText(apiEndpoint);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus(""), 1600);
  }

  async function testEndpoint() {
    setEndpointStatus("testing");
    try {
      const response = await fetch("/api/apim-test");
      const result = await response.json();
      if (Number.isInteger(result.credits)) setUser((current) => current ? { ...current, credits: result.credits } : current);
      setEndpointStatus(result.ok ? "success" : "error");
    } catch { setEndpointStatus("error"); }
  }

  async function toggleApiKeyVisibility() {
    if (!access.apiKey) {
      const key = await generateApiKey();
      if (!key) return;
    }
    setKeyVisible((visible) => !visible);
  }

  const signOut = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    window.location.href = "/";
  };

  if (loading || !user) return <main className="dashboard-shell" aria-busy="true" />;

  return (
    <main className="dashboard-shell" aria-label="Beyond Marks AI Academy dashboard">
      <div className="dashboard-student-welcome">
        <p><span>Welcome,</span><strong>{user.name}</strong></p>
        <small className="dashboard-api-label">API KEY</small>
        <div className="dashboard-api-key">
          <div className="dashboard-api-key-value">
            <code>{keyVisible && access.apiKey ? access.apiKey : access.apiKeyPrefix ? `${access.apiKeyPrefix}••••••••` : "Creating key…"}</code>
          </div>
          <button type="button" onClick={toggleApiKeyVisibility} aria-label={keyVisible ? "Hide API key" : "Show API key"} title={keyVisible ? "Hide API key" : "Show API key"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
          </button>
          <button type="button" onClick={copyApiKey} aria-label="Copy API key" title="Copy API key">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
          </button>
          {copyStatus && <small>{copyStatus}</small>}
        </div>
        <small className="dashboard-api-label endpoint-label">API ENDPOINT</small>
        <div className="dashboard-api-key dashboard-endpoint">
          <div className="dashboard-api-key-value"><code>{apiEndpoint || "Loading endpoint…"}</code></div>
          <button className={`endpoint-test endpoint-test-${endpointStatus}`} type="button" onClick={testEndpoint} aria-label="Test API endpoint" title="Test API endpoint">
            {endpointStatus === "success" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : endpointStatus === "error" ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v7l4 2" /><circle cx="12" cy="12" r="8.5" /></svg>}
          </button>
          <button type="button" onClick={copyEndpoint} aria-label="Copy API endpoint" title="Copy API endpoint">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
          </button>
        </div>
      </div>
      <div className="dashboard-credits" aria-label="100 credits">
        <small>CREDITS</small>
        <strong>{user.credits ?? 100}</strong>
      </div>
      <button className="access-button" type="button" onClick={() => setAccessOpen((open) => !open)} aria-expanded={accessOpen}>
        Access <span className="access-chevron" aria-hidden="true" />
      </button>
      {accessOpen && (
        <section className="access-panel" aria-label="Available services">
          <div className="access-panel-heading">
            <span>STUDENT ACCESS</span>
            <h2>Available services</h2>
          </div>
          {user.role === "admin" && <a className="admin-access-link" href="/admin">Open Admin Control Center <span>→</span></a>}
          <a className="admin-access-link" href="/resources">My Storage <span>→</span></a>
          <a className="admin-access-link" href="/activity">My Activity <span>→</span></a>
          <div className="access-services">
            {access.services.map((service) => <article key={service.id}><strong>{service.name}</strong><p>{service.description}</p></article>)}
          </div>
          <div className="api-key-box">
            <small>PERSONAL API KEY</small>
            <code>{access.apiKey || (access.apiKeyPrefix ? `${access.apiKeyPrefix}••••••••••••` : "Not generated")}</code>
            <button type="button" onClick={generateApiKey}>{access.apiKey ? "Regenerate key" : "Create API key"}</button>
            {access.apiKey && <p>Copy this key now. It is not stored in readable form.</p>}
          </div>
        </section>
      )}
    </main>
  );
}
