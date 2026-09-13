"use client";

import { useEffect, useState } from "react";
import type { AuditEvent } from "../../lib/contracts";
import { SessionControl } from "../session-control";

type Language = "en" | "th";
const copy = {
  en: {
    eyebrow: "AIAT × CAMT · Lab 2", title: "Security workbench", subtitle: "Blue-team controls protect every answer path.", chat: "RAG chat", knowledge: "Knowledge base", agent: "Agent workspace", system: "System readiness", warning: "Audit records contain fingerprints and decisions only; they never retain raw prompts or answers.", implemented: "Implemented controls", audit: "Recent security audit", staffOnly: "Enable staff access to view privacy-minimised audit events.", emptyAudit: "No audit events yet.",
    implementedList: ["Client and server prompt-injection and PII refusal", "Retrieved indirect-injection detection with persistent chunk quarantine", "Signed, structural validation for model-provided citations", "Server-side audit fingerprints, incident flags, and staff-only review"],
    session: { access: "Access", public: "Public", staff: "Staff", enable: "Enable staff", pin: "Staff PIN", cancel: "Cancel", logout: "Log out", submitting: "Checking…", unavailable: "Staff access is unavailable." },
  },
  th: {
    eyebrow: "AIAT × CAMT · Lab 2", title: "พื้นที่ทำงานด้านความปลอดภัย", subtitle: "Blue-team controls ปกป้องทุกเส้นทางคำตอบ", chat: "RAG chat", knowledge: "คลังความรู้", agent: "พื้นที่ทำงานเอเจนต์", system: "ความพร้อมของระบบ", warning: "Audit เก็บเฉพาะ fingerprint และการตัดสินใจ ไม่เก็บ prompt หรือคำตอบดิบ", implemented: "controls ที่สร้างแล้ว", audit: "security audit ล่าสุด", staffOnly: "เปิดใช้ staff access เพื่อดู audit ที่ลดข้อมูลส่วนบุคคล", emptyAudit: "ยังไม่มี audit event",
    implementedList: ["ปฏิเสธ prompt injection และ PII ที่ client/server", "ตรวจ indirect injection และ quarantine chunk แบบถาวร", "ตรวจ citation จากโมเดลด้วย signed structural validation", "audit fingerprint, incident flag และ review สำหรับ staff เท่านั้น"],
    session: { access: "สิทธิ์", public: "สาธารณะ", staff: "เจ้าหน้าที่", enable: "เปิดใช้ staff", pin: "Staff PIN", cancel: "ยกเลิก", logout: "ออกจากระบบ", submitting: "กำลังตรวจสอบ…", unavailable: "ไม่สามารถเปิดใช้ staff ได้" },
  },
} as const;

export default function SecurityPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const text = copy[language];
  async function loadAudit() {
    const response = await fetch("/api/security/audit", { cache: "no-store" });
    setEvents(response.ok ? (await response.json() as { events: AuditEvent[] }).events : null);
  }
  useEffect(() => { void loadAudit(); }, []);
  return <main className="lab"><header className="hero"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="subtitle">{text.subtitle}</p></div><div className="header-actions"><nav><a href="/">{text.chat}</a><a href="/knowledge">{text.knowledge}</a><a href="/agent">{text.agent}</a><a href="/system">{text.system}</a></nav><SessionControl labels={text.session} onRoleChange={() => void loadAudit()} /><div className="language" aria-label="Language"><button className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "th" ? "selected" : ""} onClick={() => setLanguage("th")}>ไทย</button></div></div></header><p className="warning" role="alert">{text.warning}</p>
    <section className="security-grid"><section className="todo-list"><p className="eyebrow">Blue team</p><h2>{text.implemented}</h2><ol>{text.implementedList.map((item) => <li key={item}>{item}</li>)}</ol></section><section className="audit-card"><p className="eyebrow">AuditEvent</p><h2>{text.audit}</h2><div className="table-wrap"><table><thead><tr><th>createdAt</th><th>role</th><th>decision</th><th>citations</th></tr></thead><tbody>{events === null ? <tr><td colSpan={4}>{text.staffOnly}</td></tr> : events.length === 0 ? <tr><td colSpan={4}>{text.emptyAudit}</td></tr> : events.map((event) => <tr key={event.id}><td>{new Date(event.createdAt).toLocaleString()}</td><td>{event.role}</td><td>{event.incidentFound ? `${event.decision} · incident` : event.decision}</td><td>{event.citationChunkIds.join(", ") || "—"}</td></tr>)}</tbody></table></div></section></section>
  </main>;
}
