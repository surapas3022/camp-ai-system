"use client";

import { type FormEvent, useState } from "react";
import type { AgentWorkspace, TaskState, UserRole } from "../../lib/contracts";
import { SessionControl } from "../session-control";

type Language = "en" | "th";

const copy = {
  en: {
    eyebrow: "AIAT x CAMT · Lab 3",
    title: "Bounded agent workspace",
    subtitle: "Search approved knowledge, create one constrained draft, then wait for a human decision.",
    chat: "RAG chat", knowledge: "Knowledge base", security: "Security workbench", agent: "Agent workspace", system: "System readiness",
    warning: "This workflow has exactly three server-owned tools. It never sends email, changes a database, runs code, or takes an external action.",
    intake: "Task intake", task: "Task", taskHint: "Example: Draft a short internal note from the public responsible-GenAI guidance.", run: "Create draft", running: "Preparing…",
    scope: "The server validates the task, selects the allowed tools, and resolves access from the signed session. A draft is not a dispatch.",
    noTask: "Enter a small, evidence-first task to view its plan, evidence, draft, approval status, and privacy-minimised trace.",
    plan: "Plan", evidence: "Evidence", draft: "Draft", approval: "Approval", trace: "Trace timeline", result: "Simulated result",
    noEvidence: "No evidence was shown.", noDraft: "No draft was created.", awaiting: "This draft needs an authenticated staff decision.", staffRequired: "Enable staff access to approve or decline this draft.", approve: "Approve draft", decline: "Decline draft", deciding: "Saving decision…",
    source: "Open source PDF", page: "Page", pages: "Pages", classification: "Classification", state: "State", tool: "Tool", step: "Step", evidenceCount: "Evidence", version: "Draft version", reason: "Reason", noReason: "—",
    planned: "Planned", awaiting_approval: "Awaiting approval", completed: "Completed", declined: "Declined", safely_stopped: "Safely stopped",
    session: { access: "Access", public: "Public", staff: "Staff", enable: "Enable staff", pin: "Staff PIN", cancel: "Cancel", logout: "Log out", submitting: "Checking…", unavailable: "Staff access is unavailable." },
  },
  th: {
    eyebrow: "AIAT x CAMT · Lab 3",
    title: "พื้นที่ทำงานเอเจนต์แบบมีขอบเขต",
    subtitle: "ค้นความรู้ที่อนุมัติ สร้าง draft ที่จำกัดหนึ่งฉบับ แล้วรอการตัดสินใจจากมนุษย์",
    chat: "RAG chat", knowledge: "คลังความรู้", security: "พื้นที่ทำงานความปลอดภัย", agent: "พื้นที่ทำงานเอเจนต์", system: "ความพร้อมของระบบ",
    warning: "เวิร์กโฟลว์นี้มี tool ที่เซิร์ฟเวอร์เป็นเจ้าของเพียงสามรายการ ระบบไม่ส่งอีเมล ไม่เปลี่ยนฐานข้อมูล ไม่รันโค้ด และไม่ทำงานภายนอก",
    intake: "รับงาน", task: "งาน", taskHint: "ตัวอย่าง: ร่างบันทึกภายในสั้น ๆ จากแนวทาง GenAI ที่รับผิดชอบสำหรับ public", run: "สร้าง draft", running: "กำลังเตรียม…",
    scope: "เซิร์ฟเวอร์ตรวจงาน เลือก tool ที่อนุญาต และ resolve สิทธิ์จาก signed session draft ไม่ใช่การส่งงานจริง",
    noTask: "ป้อนงานขนาดเล็กที่เริ่มจากหลักฐาน เพื่อดู plan, evidence, draft, สถานะการอนุมัติ และ trace ที่ลดข้อมูลส่วนบุคคล",
    plan: "แผน", evidence: "หลักฐาน", draft: "Draft", approval: "การอนุมัติ", trace: "ลำดับเวลา trace", result: "ผลลัพธ์จำลอง",
    noEvidence: "ไม่มีหลักฐานที่แสดง", noDraft: "ยังไม่ได้สร้าง draft", awaiting: "draft นี้ต้องการการตัดสินใจจาก staff ที่ยืนยันตัวตน", staffRequired: "เปิดใช้ staff access เพื่ออนุมัติหรือปฏิเสธ draft นี้", approve: "อนุมัติ draft", decline: "ปฏิเสธ draft", deciding: "กำลังบันทึกการตัดสินใจ…",
    source: "เปิด PDF ต้นฉบับ", page: "หน้า", pages: "หน้า", classification: "ชั้นข้อมูล", state: "สถานะ", tool: "Tool", step: "ขั้น", evidenceCount: "หลักฐาน", version: "Draft version", reason: "เหตุผล", noReason: "—",
    planned: "วางแผนแล้ว", awaiting_approval: "รอการอนุมัติ", completed: "เสร็จสมบูรณ์", declined: "ถูกปฏิเสธ", safely_stopped: "หยุดอย่างปลอดภัย",
    session: { access: "สิทธิ์", public: "สาธารณะ", staff: "เจ้าหน้าที่", enable: "เปิดใช้ staff", pin: "Staff PIN", cancel: "ยกเลิก", logout: "ออกจากระบบ", submitting: "กำลังตรวจสอบ…", unavailable: "ไม่สามารถเปิดใช้ staff ได้" },
  },
} as const;

async function readResponse(response: Response): Promise<AgentWorkspace> {
  const data = await response.json() as AgentWorkspace & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "The request could not be completed.");
  return data;
}

export default function AgentPage() {
  const [language, setLanguage] = useState<Language>("en");
  const [task, setTask] = useState("");
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null);
  const [role, setRole] = useState<UserRole>("public");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const text = copy[language];

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!task.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, language, idempotencyKey: crypto.randomUUID().replace(/-/gu, "") }),
      });
      setWorkspace(await readResponse(response));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The task could not be created."); }
    finally { setBusy(false); }
  }

  async function decide(decision: "approve" | "decline") {
    const draft = workspace?.draft;
    if (!workspace || !draft || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/agent/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: workspace.summary.taskId, draftVersion: draft.version, decision }),
      });
      setWorkspace(await readResponse(response));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The decision could not be saved."); }
    finally { setBusy(false); }
  }

  const state = workspace?.summary.state;
  return <main className="lab">
    <header className="hero"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p className="subtitle">{text.subtitle}</p></div><div className="header-actions"><nav><a href="/">{text.chat}</a><a href="/knowledge">{text.knowledge}</a><a href="/security">{text.security}</a><a href="/agent" aria-current="page">{text.agent}</a><a href="/system">{text.system}</a></nav><SessionControl labels={text.session} onRoleChange={setRole} /><div className="language" aria-label="Language"><button className={language === "en" ? "selected" : ""} onClick={() => setLanguage("en")}>EN</button><button className={language === "th" ? "selected" : ""} onClick={() => setLanguage("th")}>ไทย</button></div></div></header>
    <p className="warning" role="alert">{text.warning}</p>

    <section className="agent-intake"><div><p className="eyebrow">{text.intake}</p><h2>{text.intake}</h2><p>{text.scope}</p></div><form onSubmit={run}><label htmlFor="agent-task">{text.taskHint}</label><div className="agent-task-row"><textarea id="agent-task" value={task} onChange={(event) => setTask(event.target.value)} disabled={busy} maxLength={1500} placeholder={text.task} /><button type="submit" disabled={busy || !task.trim()}>{busy ? text.running : text.run}</button></div></form></section>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
    {!workspace ? <p className="empty">{text.noTask}</p> : <>
      <section className="state-strip agent-state"><div><span>{text.state}</span><strong><span className={`status ${state}`}>{text[state as TaskState]}</span></strong></div><div><span>{text.evidenceCount}</span><strong>{workspace.summary.evidenceCount}</strong></div><div><span>{text.version}</span><strong>{workspace.summary.draftVersion ?? text.noReason}</strong></div></section>
      <section className="agent-workspace">
        <article className="workspace-panel"><p className="eyebrow">01 · {text.plan}</p><h2>{text.plan}</h2><ol>{workspace.plan.map((item) => <li key={item}>{item}</li>)}</ol></article>
        <article className="workspace-panel"><p className="eyebrow">02 · {text.evidence}</p><h2>{text.evidence}</h2>{workspace.evidence.length ? <div className="evidence-list">{workspace.evidence.map((item, index) => <a key={item.id} href={item.sourceHref} target="_blank" rel="noreferrer"><strong>[{index + 1}] {item.documentName}</strong><span>{item.pageStart === item.pageEnd ? `${text.page} ${item.pageStart}` : `${text.pages} ${item.pageStart}–${item.pageEnd}`} · {text.classification}: {item.accessLevel}</span><small>{text.source}</small></a>)}</div> : <p className="empty">{text.noEvidence}</p>}</article>
        <article className="workspace-panel"><p className="eyebrow">03 · {text.draft}</p><h2>{text.draft}</h2>{workspace.draft ? <><span className="status grounded">v{workspace.draft.version}</span><p className="draft-body">{workspace.draft.body}</p></> : <p className="empty">{text.noDraft}</p>}</article>
        <article className="workspace-panel"><p className="eyebrow">04 · {text.approval}</p><h2>{text.approval}</h2>{state === "awaiting_approval" ? role === "staff" ? <div className="approval-actions"><p>{text.awaiting}</p><button onClick={() => void decide("approve")} disabled={busy}>{busy ? text.deciding : text.approve}</button><button className="text-button" onClick={() => void decide("decline")} disabled={busy}>{text.decline}</button></div> : <p className="empty">{text.staffRequired}</p> : workspace.summary.approval ? <p>{workspace.summary.approval.decision} · v{workspace.summary.approval.draftVersion}</p> : <p className="empty">{text.noReason}</p>}</article>
      </section>
      {workspace.result ? <section className="scenario-list"><p className="eyebrow">{text.result}</p><h2>{text.result}</h2><p>{workspace.result}</p></section> : null}
      <section className="audit-card agent-table"><p className="eyebrow">TraceEvent</p><h2>{text.trace}</h2><div className="table-wrap"><table><thead><tr><th>{text.state}</th><th>{text.tool}</th><th>{text.step}</th><th>{text.evidenceCount}</th><th>{text.version}</th><th>{text.reason}</th></tr></thead><tbody>{workspace.trace.map((event) => <tr key={event.id}><td>{text[event.toState]}</td><td>{event.tool ?? "policy"}</td><td>{event.step}</td><td>{event.evidenceCount}</td><td>{event.draftVersion ?? text.noReason}</td><td>{event.reasonCode ?? text.noReason}</td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}
