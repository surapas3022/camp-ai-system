"use client";

import { FormEvent, useEffect, useState } from "react";
import type { UserRole } from "../lib/contracts";

export interface SessionLabels {
  access: string; public: string; staff: string; enable: string; pin: string; cancel: string; logout: string; submitting: string; unavailable: string;
}

export function SessionControl({ labels, onRoleChange }: { labels: SessionLabels; onRoleChange?: (role: UserRole) => void }) {
  const [role, setRole] = useState<UserRole>("public");
  const [pin, setPin] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateRole = (nextRole: UserRole) => { setRole(nextRole); onRoleChange?.(nextRole); };

  useEffect(() => { void fetch("/api/session", { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ role: UserRole }> : null).then((session) => updateRole(session?.role ?? "public")).catch(() => updateRole("public")); }, []);

  async function enable(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const data = await response.json() as { role?: UserRole; error?: string };
      if (!response.ok || data.role !== "staff") throw new Error(data.error ?? labels.unavailable);
      updateRole("staff"); setPin(""); setShowForm(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : labels.unavailable); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError("");
    try { await fetch("/api/session", { method: "DELETE" }); updateRole("public"); }
    catch { setError(labels.unavailable); }
    finally { setBusy(false); }
  }

  return <section className="session-control" aria-live="polite"><span>{labels.access}</span><strong className={`access ${role}`}>{role === "staff" ? labels.staff : labels.public}</strong>{role === "staff" ? <button className="text-button" onClick={() => void logout()} disabled={busy}>{labels.logout}</button> : showForm ? <form onSubmit={enable}><input aria-label={labels.pin} type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} placeholder={labels.pin} disabled={busy} /><button type="submit" disabled={busy || !pin}>{busy ? labels.submitting : labels.enable}</button><button type="button" className="text-button" onClick={() => { setShowForm(false); setError(""); }}>{labels.cancel}</button></form> : <button className="text-button" onClick={() => setShowForm(true)}>{labels.enable}</button>}{error ? <small className="error-message">{error}</small> : null}</section>;
}
