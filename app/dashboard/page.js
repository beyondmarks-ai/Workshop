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
  const [codexOpen, setCodexOpen] = useState(false);
  const [codexMode, setCodexMode] = useState("instructions");
  const [codexPaymentOpen, setCodexPaymentOpen] = useState(false);
  const [codexAccessUntil, setCodexAccessUntil] = useState(null);
  const [codexPaymentError, setCodexPaymentError] = useState("");
  const [creditHistoryOpen, setCreditHistoryOpen] = useState(false);
  const [creditHistory, setCreditHistory] = useState(null);

  useEffect(() => {
    const refreshUser = () => fetch("/api/auth")
      .then(async (response) => {
        if (!response.ok) {
          window.location.href = "/";
          return;
        }
        const data = await response.json();
        setUser(data.user);
        setCodexAccessUntil(data.user.codexAccessUntil || null);
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

  const codexUnlocked = (user?.role === "admin" || user?.verified === true) && codexAccessUntil && new Date(codexAccessUntil).getTime() > Date.now();

  async function unlockCodex() {
    const response = await fetch("/api/codex", { method: "POST" });
    const data = await response.json();
    if (!response.ok) {
      setCodexPaymentError(data.reason || "Could not unlock Codex.");
      return;
    }
    setCodexAccessUntil(data.accessUntil);
    setCodexPaymentOpen(false);
    setCodexPaymentError("");
    setCodexOpen(true);
    fetch("/api/access").then((response) => response.ok && response.json()).then((accessData) => accessData && setAccess((current) => ({ ...current, ...accessData }))).catch(() => {});
    setUser((current) => ({ ...current, credits: data.credits }));
  }

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
    if (!codexUnlocked) { setCodexPaymentOpen(true); return; }
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
    if (!codexUnlocked) { setCodexPaymentOpen(true); return; }
    if (!access.apiKey && !await generateApiKey()) return;
    setKeyVisible((visible) => !visible);
  }

  async function openCreditHistory() {
    setCreditHistoryOpen(true);
    setCreditHistory(null);
    const response = await fetch("/api/activity");
    const data = await response.json().catch(() => ({}));
    setCreditHistory(response.ok ? data.activities || [] : []);
  }

  if (loading || !user) return <main className="dashboard-shell" aria-busy="true" />;

  const endpointItems = (access.endpoints || []).filter((endpoint) => endpoint.category === endpointCategory);

  return (
    <main className="dashboard-shell" aria-label="Beyond Marks AI Academy dashboard">
      <GravityStarsBackground starsCount={Math.max(0, Number(user.credits ?? 100))} className="dashboard-stars" />
      <button className="dashboard-codex-button" type="button" onClick={() => { setCodexMode("instructions"); setCodexOpen(true); }} aria-label="Open installation instructions">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>
        <span>Instructions</span>
      </button>
      <button className={`dashboard-codex-button dashboard-codex-locked${codexUnlocked ? " unlocked" : ""}`} type="button" onClick={() => { if (codexUnlocked) { setCodexMode("codex"); setCodexOpen(true); } else setCodexPaymentOpen(true); }} aria-label={codexUnlocked ? "Open Codex" : "Unlock Codex for 5 credits"}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        <span>{codexUnlocked ? "Codex" : "Codex Â· 5 credits"}</span>
      </button>
      {creditHistoryOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCreditHistoryOpen(false)}><section className="credit-history-modal" role="dialog" aria-modal="true" aria-labelledby="credit-history-title"><button className="codex-modal-close" type="button" onClick={() => setCreditHistoryOpen(false)} aria-label="Close credit history">×</button><small>CREDIT ACTIVITY</small><h2 id="credit-history-title">Credit history</h2><p className="codex-modal-intro">Your endpoint usage and admin credit adjustments.</p><div className="credit-history-list">{creditHistory === null ? <p>Loading history...</p> : creditHistory.length ? creditHistory.map((activity) => <article className={`credit-history-item ${activity.action === "credit-added" ? "credit-added" : "credit-deducted"}`} key={activity.id}><div><strong>{activity.service === "admin-credit" ? (activity.action === "credit-added" ? "Credits added" : "Credits removed") : activity.service}</strong><span>{new Date(activity.createdAt).toLocaleString()} · {activity.action === "credit-added" ? "+" : "-"}{Math.abs(activity.creditsUsed || 0)} credits{activity.balance !== undefined ? ` · Balance ${activity.balance}` : ""}</span>{activity.note && <p>{activity.note}</p>}</div></article>) : <p>No credit activity recorded yet.</p>}</div></section></div>}
      {codexPaymentOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCodexPaymentOpen(false)}>
        <section className="codex-modal codex-payment-modal" role="dialog" aria-modal="true" aria-labelledby="codex-payment-title">
          <button className="codex-modal-close" type="button" onClick={() => setCodexPaymentOpen(false)} aria-label="Close Codex payment">Ã—</button>
          <small>CODEX WORKSHOP</small>
          <h2 id="codex-payment-title">Unlock Codex</h2>
          <p className="codex-modal-intro">Pay 5 credits once to use Codex for the next 3 days of the workshop.</p>
          <div className="codex-payment-price"><strong>5</strong><span>credits</span></div>
          {codexPaymentError && <p className="codex-payment-error">{codexPaymentError}</p>}
          <button className="codex-payment-button" type="button" onClick={unlockCodex}>Unlock for 5 credits</button>
        </section>
      </div>}
      {codexOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCodexOpen(false)}>
        <section className="codex-modal" role="dialog" aria-modal="true" aria-labelledby="codex-title">
          <button className="codex-modal-close" type="button" onClick={() => setCodexOpen(false)} aria-label="Close Codex instructions">Ã—</button>
          {codexMode === "codex" ? <>
          <small>CODEX WORKSHOP</small>
          <h2 id="codex-title">Codex access</h2>
          <p className="codex-modal-intro">Each request or prompt entered in Codex consumes credits. Standard Codex can exhaust its allowance; this workshop Codex is admin-controlled with no request limit.</p>
          <a className="codex-tools-download" href="/api/codex/download">Download tools.rar</a>
          <div className="codex-modal-section"><strong>APIM setup</strong><div className="codex-command"><code>{`Set-ExecutionPolicy -Scope Process Bypass\nUnblock-File .\\configure-codex-apim.ps1\n.\\configure-codex-apim.ps1 ` + "`" + `\n  -ApimBaseUrl "https://codex-apim-617db5.azure-api.net" ` + "`" + `\n  -ApimKey "YOUR_KEY"`}</code><button type="button" onClick={() => copyText('Set-ExecutionPolicy -Scope Process Bypass\nUnblock-File .\\configure-codex-apim.ps1 `\n  -ApimBaseUrl "https://codex-apim-617db5.azure-api.net" `\n  -ApimKey "YOUR_KEY"')} aria-label="Copy APIM setup commands" title="Copy commands"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div></div>
          <p className="codex-modal-check">The tools download does not deduct credits. Your 3-day Codex access remains active until the workshop access period ends.</p>
          </> : <>
          <small>CODEX CLI</small>
          <h2 id="codex-title">Install Codex</h2>
          <p className="codex-modal-intro">Follow these steps in PowerShell to install and start the Codex CLI.</p>
          <div className="codex-modal-section"><strong>1. Open PowerShell</strong><div className="codex-command"><code>Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned</code><button type="button" onClick={() => copyText("Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned")} aria-label="Copy PowerShell command" title="Copy command"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div><span>When prompted, type <b>Y</b> and press Enter.</span></div>
          <div className="codex-modal-section"><strong>2. Install npm</strong><a className="codex-npm-link" href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">Download Node.js and npm from nodejs.org â†—</a><div className="codex-command"><code>{`node --version\nnpm --version`}</code><button type="button" onClick={() => copyText("node --version\nnpm --version")} aria-label="Copy npm check commands" title="Copy commands"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div></div>
          <div className="codex-modal-section"><strong>3. Install Codex CLI</strong><div className="codex-command"><code>npm install -g @openai/codex</code><button type="button" onClick={() => copyText("npm install -g @openai/codex")} aria-label="Copy Codex install command" title="Copy command"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div></div>
          <div className="codex-modal-section"><strong>4. Start Codex</strong><div className="codex-command"><code>codex</code><button type="button" onClick={() => copyText("codex")} aria-label="Copy Codex start command" title="Copy command"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div><span>Codex is installed when the CLI opens in your terminal.</span></div>
          </>}
        </section>
      </div>}
      <div className="dashboard-student-welcome">
        <p><span>Welcome,</span><strong>{user.name}</strong></p>
      </div>
      <section className="pricing-card-wrap" aria-label="Pro plan">
        <article className="pricing-card">
          <div className="pricing-card-glow" aria-hidden="true" />
          <header className="pricing-card-header">
            <div className="pricing-card-title-row"><h2>API Endpoints</h2><span className="pricing-card-badge">{endpointItems.length} available</span></div>
            <div className="dashboard-api-key">
              <div className="dashboard-api-key-value">
                <code>{!codexUnlocked ? "Locked - unlock Codex with 5 credits" : keyVisible && access.apiKey ? access.apiKey : access.apiKeyPrefix ? `${access.apiKeyPrefix}********` : "Creating key..."}</code>
              </div>
              <button type="button" onClick={toggleApiKeyVisibility} aria-label={codexUnlocked ? (keyVisible ? "Hide API key" : "Show API key") : "Unlock API key"} title={codexUnlocked ? (keyVisible ? "Hide API key" : "Show API key") : "Unlock API key"}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
              </button>
              <button type="button" onClick={copyApiKey} aria-label={codexUnlocked ? "Copy API key" : "Unlock API key"} title={codexUnlocked ? "Copy API key" : "Unlock API key"}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
              </button>
              {copyStatus && <small>{copyStatus}</small>}
            </div>
          </header>
          <div className="endpoint-category-toggle" role="tablist" aria-label="Model endpoint type">
            {[['generative', 'Generative'], ['image', 'Image models'], ['video', 'Video models'], ['other', 'Other']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={endpointCategory === id} className={endpointCategory === id ? "active" : ""} onClick={() => setEndpointCategory(id)}>{label}</button>)}
          </div>
          <div className="pricing-card-content">
            {endpointItems.length ? endpointItems.map((endpoint) => <div className="pricing-endpoint" key={endpoint.id}><div><strong>{endpoint.name}</strong><code>{endpoint.path}</code></div><span className="pricing-endpoint-cost">{endpoint.creditCost ? endpoint.creditCost + " credits" : "Free"}</span><button type="button" onClick={() => copyServiceEndpoint(endpoint.path)}>Copy endpoint</button></div>) : <p className="pricing-empty">{endpointCategory === "generative" ? "Loading endpoints..." : endpointCategory === "other" ? "Other endpoints are not configured yet." : `${endpointCategory === "image" ? "Image" : "Video"} model endpoints are not configured yet.`}</p>}
          </div>
          {copyStatus && <small className="pricing-copy-status" role="status">{copyStatus}</small>}
        </article>
      </section>
      <div className="dashboard-credits" aria-label={`${user.credits ?? 100} credits`}>
        <small>CREDITS</small>
        <strong>{user.credits ?? 100}</strong>
        <button className="dashboard-history-link" type="button" onClick={openCreditHistory}>History</button>
      </div>
    </main>
  );
}
