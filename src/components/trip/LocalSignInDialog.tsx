"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import styles from "./TripIntentPanel.module.css";

export default function LocalSignInDialog({ onAuthenticated, onCancel }: { onAuthenticated: () => Promise<void>; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(null);
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) { setError("Email or password is not valid for local development."); setPending(false); return; }
    try { await onAuthenticated(); } catch { setError("Signed in, but the trip could not be saved."); setPending(false); }
  }
  return <div className={styles.authDialog} role="dialog" aria-modal="true" aria-label="Sign in to Waypost">
    <form onSubmit={submit}><h2>Sign in to Waypost</h2><p>Save your trip and keep building your travel map.</p>
      <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label>
      <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button><button type="button" onClick={onCancel} disabled={pending}>Cancel</button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}<small>Local development identity provider</small>
    </form></div>;
}
