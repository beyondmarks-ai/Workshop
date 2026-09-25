"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { languages } from "../lib/languages";

export default function Home() {
  const backgroundVideoRef = useRef(null);
  const [mode, setMode] = useState(null);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && setMode(null);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    fetch("/api/auth")
      .then(async (response) => response.ok ? setUser((await response.json()).user) : setUser(null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const video = backgroundVideoRef.current;
    if (!video) return undefined;
    const sources = [
      { url: "https://astra-bg-cnf7bta0crg5fugq.z01.azurefd.net/assetsbg/hls/master.m3u8", type: "hls" },
      { url: "https://astra617db5store.blob.core.windows.net/assetsbg/hls/master.m3u8", type: "hls" },
      { url: "https://astra617db5store.blob.core.windows.net/assetsbg/bg.mp4", type: "mp4" }
    ];
    let hls;
    let sourceIndex = 0;
    const attachSource = () => {
      const source = sources[sourceIndex];
      if (hls) { hls.destroy(); hls = undefined; }
      if (source.type === "mp4") {
        video.src = source.url;
        video.load();
        video.play().catch(() => {});
        return;
      }
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = source.url;
        video.load();
        video.play().catch(() => {});
        return;
      }
      if (!Hls.isSupported()) return;
      hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30, backBufferLength: 30 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal && sourceIndex < sources.length - 1) {
          sourceIndex += 1;
          attachSource();
        }
      });
      hls.loadSource(source.url);
      hls.attachMedia(video);
    };
    attachSource();
    return () => {
      if (hls) hls.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  const authenticate = async (event, action) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (action === "signup" && form.get("password") !== form.get("confirm-password")) return setAuthError("Passwords do not match.");
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          name: form.get("name"),
          contact: form.get("contact"),
          email: form.get("email"),
          contactNumber: form.get("contactNumber"),
          branch: form.get("branch"),
          semester: form.get("semester"),
          usn: form.get("usn"),
          password: form.get("password")
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Authentication failed.");
      window.location.href = "/";
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <main>
      <video ref={backgroundVideoRef} className="background-video" autoPlay loop muted playsInline preload="auto" fetchPriority="high" aria-hidden="true">
      </video>
      <div className="welcome-panel">
        <p className="eyebrow">BEYOND THE ORDINARY</p>
        <h1 className="welcome"><span>Welcome to</span><strong>Beyond Marks</strong><em>AI Academy Workshop</em></h1>
        <p className="welcome-tagline">Learn boldly. Build intelligently. Make your mark.</p>
        {user ? (
          <section className="student-welcome" aria-live="polite">
            <p>STUDENT PORTAL</p>
            <strong>Welcome, {user.name}</strong>
            <span>Your learning space is ready.</span>
            <div className="student-details">
              <span><b>Branch</b>{user.branch}</span>
              <span><b>Semester</b>{user.semester}</span>
              <span><b>USN</b>{user.usn}</span>
            </div>
            <button className="student-signout" type="button" onClick={async () => { await fetch("/api/auth", { method: "DELETE" }); setUser(null); }}>Sign Out</button>
          </section>
        ) : (
          <>
            <div className="auth-actions">
              <button className="launch-button login-button" onClick={() => setMode("signin")}>Sign In</button>
              <button className="launch-button signup-button" onClick={() => setMode("signup")}>Register <span aria-hidden="true">→</span></button>
            </div>
            <span className="skip-dashboard">A new way to learn with AI</span>
          </>
        )}
      </div>

      {mode && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMode(null)}>
          <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="close-button" onClick={() => setMode(null)} aria-label="Close dialog">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>

            <p className="modal-kicker">BEYOND MARKS · AI ACADEMY WORKSHOP</p>
            <h2 id="auth-title">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
            <p className="modal-description">{mode === "signup" ? "Set up your profile to begin your learning journey." : "Enter your details to continue to your account."}</p>

            <div className="auth-tabs" role="tablist" aria-label="Choose account action">
              <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setAuthError(""); }} role="tab" aria-selected={mode === "signup"}>Register</button>
              <button className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setAuthError(""); }} role="tab" aria-selected={mode === "signin"}>Sign In</button>
            </div>

            {mode === "signup" ? (
              <form className="auth-form signup-form" onSubmit={(event) => authenticate(event, "signup")}>
                <label>Full Name<input name="name" type="text" autoComplete="name" placeholder="Your full name" autoFocus required /></label>
                <label>Email ID<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
                <label>Contact Number<input name="contactNumber" type="tel" autoComplete="tel" placeholder="+91 98765 43210" required /></label>
                <label>Branch<input name="branch" type="text" placeholder="e.g. Computer Science" required /></label>
                <label>Semester<select name="semester" defaultValue="" required><option value="" disabled>Select semester</option>{Array.from({ length: 8 }, (_, index) => <option key={index + 1}>Semester {index + 1}</option>)}</select></label>
                <label>USN<input name="usn" type="text" placeholder="Your university seat number" required /></label>
                <label>Password<input name="password" type="password" autoComplete="new-password" placeholder="Minimum 8 characters" minLength="8" required /></label>
                <label>Confirm Password<input name="confirm-password" type="password" autoComplete="new-password" placeholder="Repeat password" minLength="8" required /></label>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="submit-button" type="submit" disabled={authBusy}>{authBusy ? "Creating account..." : "Create Account"} <span aria-hidden="true">→</span></button>
              </form>
            ) : (
              <form className="auth-form signin-form" onSubmit={(event) => authenticate(event, "signin")}>
                <label>Email / Phone<input name="contact" type="text" autoComplete="username" placeholder="you@example.com" autoFocus required /></label>
                <label>Password<input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required /></label>
                <button className="forgot" type="button">Forgot Password?</button>
                {authError && <p className="auth-error" role="alert">{authError}</p>}
                <button className="submit-button" type="submit" disabled={authBusy}>{authBusy ? "Signing in..." : "Sign In"} <span aria-hidden="true">→</span></button>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
