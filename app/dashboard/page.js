"use client";

import { useEffect, useState } from "react";
import GravityStarsBackground from "../components/gravity-stars-background";
import { marketplaceCatalog, marketplaceItems } from "../../lib/marketplace";

const sarvamVoiceSamples = [
  { id: "priya", name: "Priya", tone: "Warm and friendly", src: "/audio/sarvam/priya.wav" },
  { id: "aditya", name: "Aditya", tone: "Professional male", src: "/audio/sarvam/aditya.wav" },
  { id: "shreya", name: "Shreya", tone: "Calm narration", src: "/audio/sarvam/shreya.wav" },
  { id: "tanya", name: "Tanya", tone: "Young and energetic", src: "/audio/sarvam/tanya.wav" }
];

const documentationSections = [
  { title: "Luna — text and reasoning", prompt: "Use the Luna endpoint to answer this request clearly and cite assumptions: YOUR_TASK.", example: `POST /api/proxy/responses?model=gpt-5.6-luna\n{"input":[{"role":"user","content":"Explain photosynthesis for a first-year student."}]}` },
  { title: "Gemini — Vertex AI", prompt: "Use Vertex Gemini for a concise answer and follow the requested format exactly: YOUR_TASK.", example: `POST /api/proxy/vertex?model=gemini-3.5-flash&operation=generate\n{"contents":[{"role":"user","parts":[{"text":"Summarize this lesson in five bullet points."}]}]}` },
  { title: "Image models", prompt: "Create an image with the subject, style, lighting, composition, and output size: YOUR_IMAGE_REQUEST.", example: `POST /api/proxy/images?model=gpt-image-2\n{"prompt":"A clean futuristic classroom, editorial illustration, soft daylight","n":1,"size":"1024x1024","quality":"medium"}` },
  { title: "Video — Sora 2", prompt: "Create a short video with a subject, action, camera movement, duration, aspect ratio, and visual style: YOUR_VIDEO_REQUEST.", example: `POST /api/proxy/videos?model=sora-2\n{"prompt":"A student walks through a bright AI lab, slow cinematic camera move","size":"1280x720","seconds":"8"}` }
];

function creditActivityLabel(activity) {
  if (activity.service === "admin-credit") return activity.action === "credit-added" ? "Credits added" : "Credits removed";
  if (activity.service === "admin-marketplace") return "Marketplace access removed";
  if (activity.service === "marketplace") return "Marketplace purchase";
  if (activity.service === "foundry-responses") return "OpenAI endpoint usage";
  if (activity.service === "vertex") return "Vertex AI usage";
  if (activity.service === "sarvam") return "Sarvam AI usage";
  if (activity.service === "claude") return "Claude usage";
  return activity.service || "Endpoint usage";
}

function creditActivityKind(activity) {
  return activity.action === "credit-added" ? "credit-added" : "credit-deducted";
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState({ apiKeyPrefix: null, apiKey: "" });
  const [keyVisible, setKeyVisible] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [endpointCategory, setEndpointCategory] = useState("generative");
  const [codexOpen, setCodexOpen] = useState(false);
  const [codexMode, setCodexMode] = useState("instructions");
  const [codexPaymentOpen, setCodexPaymentOpen] = useState(false);
  const [codexAccessUntil, setCodexAccessUntil] = useState(null);
  const [codexPaymentError, setCodexPaymentError] = useState("");
  const [creditHistoryOpen, setCreditHistoryOpen] = useState(false);
  const [creditHistory, setCreditHistory] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [marketplaceCart, setMarketplaceCart] = useState([]);
  const [marketplaceMessage, setMarketplaceMessage] = useState("");
  const [purchaseToast, setPurchaseToast] = useState("");
  const [purchaseErrorToast, setPurchaseErrorToast] = useState("");
  const [marketplaceBusy, setMarketplaceBusy] = useState(false);
  const [marketplaceCategory, setMarketplaceCategory] = useState("all");
  const [marketplaceProvider, setMarketplaceProvider] = useState("all");
  const [marketplaceCartOpen, setMarketplaceCartOpen] = useState(false);
  const [marketplacePurchases, setMarketplacePurchases] = useState([]);
  const [playingVoice, setPlayingVoice] = useState("");

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
    fetch("/api/notifications").then((response) => response.ok && response.json()).then((data) => data && setNotifications(data.notifications || [])).catch(() => {});
    fetch("/api/marketplace").then((response) => response.ok && response.json()).then((data) => data && setMarketplacePurchases(data.purchases || [])).catch(() => {});
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

  async function requestApiKey(action = "reveal") {
    setApiKeyBusy(true);
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not access API key");
      setAccess((current) => ({ ...current, ...data }));
      return data.apiKey;
    } catch (error) {
      setCopyStatus(error.message || "Could not access API key");
      window.setTimeout(() => setCopyStatus(""), 4000);
      return null;
    } finally {
      setApiKeyBusy(false);
    }
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
    const key = access.apiKey || await requestApiKey("reveal");
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
    if (!access.apiKey && !await requestApiKey("reveal")) return;
    setKeyVisible((visible) => !visible);
  }

  async function rotateApiKey() {
    if (!codexUnlocked) { setCodexPaymentOpen(true); return; }
    if (!window.confirm("Rotate this API key? The current key will stop working immediately and Codex must be configured again.")) return;
    const key = await requestApiKey("rotate");
    if (!key) return;
    setKeyVisible(true);
    await copyText(key);
    setCopyStatus("New key copied");
    window.setTimeout(() => setCopyStatus(""), 3000);
  }

  async function openCreditHistory() {
    setCreditHistoryOpen(true);
    setCreditHistory(null);
    const response = await fetch("/api/activity");
    const data = await response.json().catch(() => ({}));
    setCreditHistory(response.ok ? data.activities || [] : []);
  }

  async function openNotifications() {
    setNotificationOpen(true);
    const response = await fetch("/api/notifications");
    const data = await response.json().catch(() => ({}));
    if (response.ok) setNotifications(data.notifications || []);
  }

  async function markNotificationRead(id) {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "mark-read", id }) });
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read: true } : item));
  }

  async function purchaseMarketplace() {
    setMarketplaceBusy(true);
    setMarketplaceMessage("");
    const response = await fetch("/api/marketplace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemIds: marketplaceCart }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const lowBalance = response.status === 402 || response.status === 429 || /need .* credits|no credits/i.test(String(data.error || "")); const message = lowBalance ? "Low balance. Add credits to buy this model." : data.error || "Purchase could not be completed."; setMarketplaceMessage(message); if (lowBalance) { setPurchaseErrorToast(message); window.setTimeout(() => setPurchaseErrorToast(""), 4200); } }
    else { const purchasedNames = marketplaceItemsList.filter((item) => marketplaceCart.includes(item.id)).map((item) => item.name); setUser((current) => ({ ...current, credits: data.credits })); setMarketplacePurchases(data.purchases || []); setMarketplaceCart([]); setMarketplaceMessage("Added to your services."); setMarketplaceCartOpen(false); setPurchaseToast(`Thank you. ${purchasedNames.join(", ")} is now active.`); window.setTimeout(() => setPurchaseToast(""), 4200); fetch("/api/access").then((accessResponse) => accessResponse.ok && accessResponse.json()).then((accessData) => accessData && setAccess((current) => ({ ...current, ...accessData }))).catch(() => {}); }
    setMarketplaceBusy(false);
  }

  function toggleVoiceSample(event, voiceId) {
    event.preventDefault();
    event.stopPropagation();
    const audio = event.currentTarget.parentElement.querySelector("audio");
    document.querySelectorAll(".marketplace-voice-audio").forEach((player) => { if (player !== audio) player.pause(); });
    if (audio.paused) { audio.play().then(() => setPlayingVoice(voiceId)).catch(() => {}); } else { audio.pause(); setPlayingVoice(""); }
  }

  if (loading || !user) return <main className="dashboard-shell" aria-busy="true" />;

  const endpointItems = (access.endpoints || []).filter((endpoint) => endpoint.category === endpointCategory);
  const marketplaceItemsList = marketplaceItems();
  const marketplaceKinds = [{ id: "all", name: "All categories" }, { id: "chat", name: "Chat" }, { id: "image", name: "Image" }, { id: "video", name: "Video" }, { id: "audio", name: "Audio" }, { id: "embeddings", name: "Embeddings" }, { id: "tools", name: "Tools" }];
  const marketplaceProviders = [{ id: "all", name: "All models" }, ...marketplaceCatalog.map((service) => ({ id: service.name, name: service.name }))];

  return (
    <main className="dashboard-shell" aria-label="Beyond Marks AI Academy dashboard">
      <GravityStarsBackground starsCount={Math.max(0, Number(user.credits ?? 100))} className="dashboard-stars" />
      {purchaseToast && <div className="purchase-toast" role="status"><span className="purchase-toast-icon" aria-hidden="true">✓</span><div><strong>Purchase complete</strong><p>{purchaseToast}</p></div><button type="button" onClick={() => setPurchaseToast("")} aria-label="Close purchase confirmation">×</button></div>}
      {purchaseErrorToast && <div className="purchase-toast purchase-toast-error" role="alert"><span className="purchase-toast-icon" aria-hidden="true">!</span><div><strong>Low balance</strong><p>{purchaseErrorToast}</p></div><button type="button" onClick={() => setPurchaseErrorToast("")} aria-label="Close low balance alert">×</button></div>}
      <header className="dashboard-header-bar">
        <nav className="dashboard-action-bar" aria-label="Dashboard actions">
          <button className="dashboard-codex-button" type="button" onClick={() => { setCodexMode("instructions"); setCodexOpen(true); }} aria-label="Open installation instructions">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>
            <span>Instructions</span>
          </button>
          <button className={`dashboard-codex-button dashboard-codex-locked${codexUnlocked ? " unlocked" : ""}`} type="button" onClick={() => { if (codexUnlocked) { setCodexMode("codex"); setCodexOpen(true); } else setCodexPaymentOpen(true); }} aria-label={codexUnlocked ? "Open Codex" : "Unlock Codex for 5 credits"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
            <span>{codexUnlocked ? "Codex" : "Codex · 5 credits"}</span>
          </button>
          <button className="dashboard-marketplace-button" type="button" onClick={() => setMarketplaceOpen(true)} aria-label="Open AI marketplace"><span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18l-2 13H5L3 6Z"/><path d="M8 6a4 4 0 0 1 8 0"/><path d="M9 10h.01M15 10h.01"/></svg></span> Marketplace</button>
          <button className="dashboard-documentation-button" type="button" onClick={() => setDocumentationOpen(true)} aria-label="Open API documentation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h3M9 12h6M9 16h6" /></svg><span>Documentation</span></button>
        </nav>
        <div className="dashboard-status-bar">
          <button className="dashboard-notification-button" type="button" onClick={openNotifications} aria-label="Open notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>{notifications.some((item) => !item.read) && <span>{notifications.filter((item) => !item.read).length}</span>}</button>
          <button className="dashboard-history-link" type="button" onClick={openCreditHistory}>Credit history</button>
          <div className="dashboard-credits" aria-label={`${user.credits ?? 100} credits`}><small>CREDITS</small><strong>{user.credits ?? 100}</strong></div>
        </div>
      </header>
      {notificationOpen && <section className="notification-popover" role="dialog" aria-labelledby="notifications-title"><div className="notification-popover-heading"><div><small>ACADEMY NOTIFICATIONS</small><h2 id="notifications-title">Notifications</h2></div><button type="button" onClick={() => setNotificationOpen(false)} aria-label="Close notifications"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div><div className="notification-list">{notifications.length ? notifications.map((item) => <article className={item.read ? "read" : "unread"} key={item.id} onClick={() => markNotificationRead(item.id)}><strong>{item.title}</strong><span>{new Date(item.createdAt).toLocaleString()}</span><p>{item.message}</p></article>) : <p>No notifications yet.</p>}</div></section>}
      {marketplaceOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMarketplaceOpen(false)}>
        <section className="marketplace-modal" role="dialog" aria-modal="true" aria-labelledby="marketplace-title">
          <button className="codex-modal-close" type="button" onClick={() => setMarketplaceOpen(false)} aria-label="Close marketplace">×</button>
<button className="marketplace-cart-button" type="button" onClick={() => setMarketplaceCartOpen(true)} aria-label="Open cart">Cart <span>{marketplaceCart.length}</span></button>
          <small>AI MODEL MARKETPLACE</small>
          <h2 id="marketplace-title">Choose a model</h2>
          <p className="codex-modal-intro">Browse models by capability and buy access using credits.</p>
          <div className="marketplace-content-scroll">
          <div className="marketplace-filter-group"><strong>Model</strong><div className="marketplace-category-tabs">{marketplaceProviders.map((provider) => <button type="button" className={marketplaceProvider === provider.id ? "active" : ""} onClick={() => setMarketplaceProvider(provider.id)} key={provider.id}>{provider.name}</button>)}</div></div>
<div className="marketplace-filter-group"><strong>Category</strong><div className="marketplace-category-tabs">{marketplaceKinds.map((kind) => <button type="button" className={marketplaceCategory === kind.id ? "active" : ""} onClick={() => setMarketplaceCategory(kind.id)} key={kind.id}>{kind.name}</button>)}</div></div>
          <div className="marketplace-grid">
            {marketplaceKinds.filter((kind) => kind.id !== "all" && (marketplaceCategory === "all" || marketplaceCategory === kind.id)).map((kind) => <article className="marketplace-category" key={kind.id}>
              <div className="marketplace-category-heading"><strong>{kind.name} models</strong><span>{marketplaceItemsList.filter((item) => item.kind === kind.id && (marketplaceProvider === "all" || item.category === marketplaceProvider)).length} available</span></div>
              <div className="marketplace-items">
                {marketplaceItemsList.filter((item) => item.kind === kind.id && (marketplaceProvider === "all" || item.category === marketplaceProvider)).map((item) => <label key={item.id} className={`marketplace-item comet-card${marketplaceCart.includes(item.id) ? " selected" : ""}`}>
  <input type="checkbox" checked={marketplaceCart.includes(item.id)} disabled={marketplacePurchases.some((purchase) => purchase.itemId === item.id)} onChange={(event) => setMarketplaceCart((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} aria-label={`Add ${item.name} to cart`} />
  <div className="comet-card-content">
    <div className="comet-card-heading"><b>{item.name}</b><span>{item.category}</span></div>
    <small>{item.description}</small>
    {item.id === "sarvam-bulbul-v3" && <div className="marketplace-voice-samples" onClick={(event) => event.stopPropagation()}><div className="marketplace-voice-samples-heading"><span>Voice samples</span><small>Bulbul v3</small></div>{sarvamVoiceSamples.map((voice) => <div className="marketplace-voice-sample" key={voice.id}><button type="button" className={`marketplace-voice-play${playingVoice === voice.id ? " playing" : ""}`} onClick={(event) => toggleVoiceSample(event, voice.id)} aria-label={`${playingVoice === voice.id ? "Pause" : "Play"} ${voice.name} voice sample`}>{playingVoice === voice.id ? "Ⅱ" : "▶"}</button><div className="marketplace-voice-meta"><strong>{voice.name}</strong><small>{voice.tone}</small></div><div className="marketplace-voice-wave" aria-hidden="true">{[34, 58, 43, 72, 48, 84, 55, 38, 67, 46, 76, 52, 36, 64, 45, 70].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><audio className="marketplace-voice-audio" src={voice.src} preload="metadata" onEnded={() => setPlayingVoice("")} /></div>)}</div>}
    <div className="comet-card-footer"><em>{item.credits ? `${item.credits} credits` : "Free"}</em><span className="comet-card-cart-hint">{marketplacePurchases.some((purchase) => purchase.itemId === item.id) ? "Already bought" : marketplaceCart.includes(item.id) ? "In cart" : "Select to add"}</span></div>
  </div>
</label>)}
              </div>
            </article>)}
          </div>
          </div>
          {marketplaceCartOpen && <aside className="marketplace-cart-drawer" aria-label="Shopping cart"><div className="marketplace-cart-heading"><div><small>YOUR CART</small><h3>Selected models</h3></div><button type="button" onClick={() => setMarketplaceCartOpen(false)} aria-label="Close cart">×</button></div><div className="marketplace-cart-items">{marketplaceItemsList.filter((item) => marketplaceCart.includes(item.id)).map((item) => <div className="marketplace-cart-item" key={item.id}><div><strong>{item.name}</strong><small>{item.category}</small></div><span>{item.credits ? `${item.credits} credits` : "Free"}</span><button type="button" onClick={() => setMarketplaceCart((current) => current.filter((id) => id !== item.id))} aria-label={`Remove ${item.name}`}>×</button></div>)}{!marketplaceCart.length && <p className="marketplace-cart-empty">Your cart is empty. Select a model to add it.</p>}</div><div className="marketplace-cart-total"><span>Total</span><strong>{marketplaceItemsList.filter((item) => marketplaceCart.includes(item.id)).reduce((sum, item) => sum + item.credits, 0)} credits</strong></div><button className="marketplace-cart-buy" type="button" onClick={purchaseMarketplace} disabled={marketplaceBusy || !marketplaceCart.length}>{marketplaceBusy ? "Processing..." : "Buy with credits"}</button></aside>}          {marketplaceMessage && <p className="marketplace-message">{marketplaceMessage}</p>}
        </section>
      </div>}
      {documentationOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDocumentationOpen(false)}><section className="codex-modal api-documentation-modal" role="dialog" aria-modal="true" aria-labelledby="api-documentation-title"><button className="codex-modal-close" type="button" onClick={() => setDocumentationOpen(false)} aria-label="Close documentation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button><small>API DOCUMENTATION</small><h2 id="api-documentation-title">Prompt and request guide</h2><p className="codex-modal-intro">Buy the model first, copy your API key, and send JSON to the matching endpoint. Replace <b>YOUR_API_KEY</b> only.</p><div className="codex-modal-section"><strong>Every request</strong><code>Base URL: your dashboard URL<br />Header: x-api-key: YOUR_API_KEY<br />Header: Content-Type: application/json</code><span>Use the exact model name shown in your dashboard. Verification, purchase access, and credits are checked automatically.</span></div>{documentationSections.map((section) => <div className="codex-modal-section" key={section.title}><strong>{section.title}</strong><span>Prompt for Codex: {section.prompt}</span><div className="codex-command"><code>{section.example}</code><button type="button" onClick={() => copyText(section.example)} aria-label="Copy example" title="Copy example"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0 2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div></div>)}<div className="codex-modal-section"><strong>Claude and Sarvam</strong><span>Claude uses a messages body. Sarvam TTS uses <b>text</b>, <b>target_language_code</b>, and <b>speaker</b>. Always use the endpoint shown in your dashboard and never put an APIM subscription key in student code.</span></div></section></div>}
      {creditHistoryOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCreditHistoryOpen(false)}><section className="credit-history-modal" role="dialog" aria-modal="true" aria-labelledby="credit-history-title"><button className="codex-modal-close" type="button" onClick={() => setCreditHistoryOpen(false)} aria-label="Close credit history"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button><small>CREDIT ACTIVITY</small><h2 id="credit-history-title">Credit history</h2><p className="codex-modal-intro">A clear record of credits added, endpoint usage, and purchases.</p><div className="credit-history-list">{creditHistory === null ? <p>Loading history...</p> : creditHistory.length ? creditHistory.map((activity) => { const kind = creditActivityKind(activity); const amount = Math.abs(Number(activity.creditsUsed) || 0); return <article className={`credit-history-item ${kind}`} key={activity.id}><div><strong>{creditActivityLabel(activity)} <em>{kind === "credit-added" ? "+" : "-"}{amount} credits</em></strong><span>{new Date(activity.createdAt).toLocaleString()}</span>{activity.note && <p>{activity.note}</p>}</div></article>; }) : <p>No credit activity recorded yet.</p>}</div></section></div>}
      {codexPaymentOpen && <div className="codex-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCodexPaymentOpen(false)}>
        <section className="codex-modal codex-payment-modal" role="dialog" aria-modal="true" aria-labelledby="codex-payment-title">
          <button className="codex-modal-close" type="button" onClick={() => setCodexPaymentOpen(false)} aria-label="Close Codex payment">×</button>
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
          <button className="codex-modal-close" type="button" onClick={() => setCodexOpen(false)} aria-label="Close Codex instructions">×</button>
          {codexMode === "codex" ? <>
          <small>CODEX WORKSHOP</small>
          <h2 id="codex-title">Codex access</h2>
          <p className="codex-modal-intro">Each request or prompt entered in Codex consumes credits. Standard Codex can exhaust its allowance; this workshop Codex is admin-controlled with no request limit.</p>
          <a className="codex-tools-download" href="/api/codex/download">Download tools.rar</a>
          <div className="codex-modal-section"><strong>One-time Codex setup</strong><div className="codex-command"><code>{`Set-ExecutionPolicy -Scope Process Bypass\nUnblock-File .\\configure-codex-apim.ps1\n.\\configure-codex-apim.ps1 -ApimKey "YOUR_BMA_KEY"`}</code><button type="button" onClick={() => copyText('Set-ExecutionPolicy -Scope Process Bypass\nUnblock-File .\\configure-codex-apim.ps1\n.\\configure-codex-apim.ps1 -ApimKey "YOUR_BMA_KEY"')} aria-label="Copy Codex setup commands" title="Copy commands"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div><span>Run this once. In Codex, type <b>/model</b> to switch between Luna, Sol, and Terra with the same key. Only purchased models can run.</span></div>
          <p className="codex-modal-check">The tools download does not deduct credits. Your 3-day Codex access remains active until the workshop access period ends.</p>
          </> : <>
          <small>CODEX CLI</small>
          <h2 id="codex-title">Install Codex</h2>
          <p className="codex-modal-intro">Follow these steps in PowerShell to install and start the Codex CLI.</p>
          <div className="codex-modal-section"><strong>1. Open PowerShell</strong><div className="codex-command"><code>Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned</code><button type="button" onClick={() => copyText("Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned")} aria-label="Copy PowerShell command" title="Copy command"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div><span>When prompted, type <b>Y</b> and press Enter.</span></div>
          <div className="codex-modal-section"><strong>2. Install npm</strong><a className="codex-npm-link" href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">Download Node.js and npm from nodejs.org ↗</a><div className="codex-command"><code>{`node --version\nnpm --version`}</code><button type="button" onClick={() => copyText("node --version\nnpm --version")} aria-label="Copy npm check commands" title="Copy commands"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div></div>
          <div className="codex-modal-section"><strong>3. Install Codex CLI</strong><div className="codex-command"><code>npm install -g @openai/codex</code><button type="button" onClick={() => copyText("npm install -g @openai/codex")} aria-label="Copy Codex install command" title="Copy command"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div></div>
          <div className="codex-modal-section"><strong>4. Start Codex</strong><div className="codex-command"><code>codex</code><button type="button" onClick={() => copyText("codex")} aria-label="Copy Codex start command" title="Copy command"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg></button></div><span>Codex is installed when the CLI opens in your terminal.</span></div>
          </>}
        </section>
      </div>}
      <div className="dashboard-primary-content">
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
                <code>{!codexUnlocked ? "Locked - unlock Codex with 5 credits" : keyVisible && access.apiKey ? access.apiKey : access.apiKeyPrefix ? `${access.apiKeyPrefix}********` : "No API key"}</code>
              </div>
              <button type="button" onClick={toggleApiKeyVisibility} aria-label={codexUnlocked ? (keyVisible ? "Hide API key" : "Show API key") : "Unlock API key"} title={codexUnlocked ? (keyVisible ? "Hide API key" : "Show API key") : "Unlock API key"}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-5 9.5-5 9.5 5 9.5 5-3.4 5-9.5 5-9.5-5-9.5-5Z" /><circle cx="12" cy="12" r="2.5" /></svg>
              </button>
              <button type="button" onClick={copyApiKey} aria-label={codexUnlocked ? "Copy API key" : "Unlock API key"} title={codexUnlocked ? "Copy API key" : "Unlock API key"}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
              </button>
              <button type="button" onClick={rotateApiKey} disabled={apiKeyBusy} aria-label="Rotate API key" title="Rotate API key">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.8-2L20 9M4 15l2.1 2a7 7 0 0 0 11.8-2" /></svg>
              </button>
              {copyStatus && <small>{copyStatus}</small>}
            </div>
          </header>
          <div className="endpoint-category-toggle" role="tablist" aria-label="Model endpoint type">
            {[['generative', 'Generative'], ['image', 'Image models'], ['video', 'Video models'], ['audio', 'Audio & voices'], ['other', 'Other']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={endpointCategory === id} className={endpointCategory === id ? "active" : ""} onClick={() => setEndpointCategory(id)}>{label}</button>)}
          </div>
          <div className="pricing-card-content">
            {endpointItems.length ? endpointItems.map((endpoint) => <div className="pricing-endpoint" key={endpoint.id}><div><strong>{endpoint.name}</strong><code>{endpoint.path}</code></div><span className="pricing-endpoint-cost">{endpoint.creditCost ? endpoint.creditCost + " credits" : "Free"}</span><button type="button" onClick={() => copyServiceEndpoint(endpoint.path)}>Copy endpoint</button></div>) : <p className="pricing-empty">Buy a model in Marketplace to unlock its endpoint.</p>}
          </div>
          {copyStatus && <small className="pricing-copy-status" role="status">{copyStatus}</small>}
        </article>
        </section>
      </div>
    </main>
  );
}
